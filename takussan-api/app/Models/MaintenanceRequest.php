<?php

namespace App\Models;

use App\Http\Filters\DateBoundaryFilter;
use App\Http\Filters\TypedExactFilter;
use App\Http\Middleware\EnsureAgencyWritable;
use App\Models\Bases\AbstractModel;
use App\Models\Contracts\HasAuditAgency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Services\Maintenance\MaintenanceQueue;
use App\Services\Maintenance\ProviderEligibility;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\BailleurDuBien;
use App\Sorts\MaintenancePrioritySort;
use App\Support\Http\ParametreUnique;
use App\Support\Query\DepartageQueryBuilder;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Laravel\Scout\Searchable;
use Spatie\Image\Enums\Fit;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\AllowedSort;
use Spatie\QueryBuilder\QueryBuilder;

class MaintenanceRequest extends AbstractModel implements HasAuditAgency, HasMedia
{
    use HasFactory, InteractsWithMedia, Searchable, SoftDeletes;

    /** TCK-2088 — grand côté de la vignette des photos (tuiles de la galerie, 3 à 5 colonnes). */
    public const THUMBNAIL_WIDTH = 400;

    /**
     * TCK-1991 (P169.03) — `metadata.urgent_since` date le passage en urgent (création ou `PATCH`) :
     * l'escalade compte ses 30 minutes depuis elle, `created_at` en repli pour les demandes plus
     * anciennes que la marque. `metadata.escalated_at` marque l'escalade faite. Les deux tombent
     * quand la priorité quitte `urgent`.
     */
    public const URGENT_SINCE = 'urgent_since';

    public const ESCALATED_AT = 'escalated_at';

    /**
     * ⚠ TCK-474 — `resolution_report` A ÉTÉ RETIRÉ d'ici, et ne doit pas y revenir sans
     * migration. Il y avait été ajouté par une passe de scaffolding (74c507bb) qui, dans
     * le MÊME commit, écrivait dans `docs/backend-gap-report.md` que le champ n'existait
     * pas — jamais aucune migration ne l'a créé. Un `$fillable` sans colonne n'est pas
     * inerte : il traverse la validation puis meurt à l'UPDATE en 500 (`SQLSTATE[42703]`),
     * et sur PostgreSQL abandonne la transaction entière au passage.
     *
     * Le rapport d'intervention passe par `resolution_notes` (colonne `text`) et la
     * collection média `completion_photos`. Voir `UpdateMaintenanceRequestRequest`, qui
     * refuse le champ explicitement plutôt que de l'avaler.
     */
    protected $fillable = [
        'property_id', 'lease_id', 'requester_id', 'assigned_to',
        'title', 'description', 'category', 'priority', 'status',
        'estimated_cost', 'actual_cost',
        'quote_amount', 'quote_currency', 'quote_submitted_at',
        'quote_decision_at', 'quote_decision_by_id', 'quote_rejection_reason',
        'scheduled_at', 'started_at', 'completed_at',
        'resolution_notes', 'metadata',
        'accepted_at', 'access_instructions',
        'quote_lines', 'quote_valid_until', 'quote_estimated_duration_days',
    ];

    protected $casts = [
        'category' => MaintenanceCategory::class,
        'priority' => MaintenancePriority::class,
        'status' => MaintenanceStatus::class,
        'estimated_cost' => 'decimal:2',
        'actual_cost' => 'decimal:2',
        'quote_amount' => 'decimal:2',
        'quote_submitted_at' => 'datetime',
        'quote_decision_at' => 'datetime',
        'scheduled_at' => 'datetime',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'accepted_at' => 'datetime',
        // TCK-2652 — l'entrée dans la file courante, posée par {@see self::booted()}.
        'queue_entered_at' => 'datetime',
        'quote_lines' => 'array',
        'quote_valid_until' => 'date',
        'quote_estimated_duration_days' => 'integer',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['property_id', 'lease_id', 'requester_id', 'assigned_to', 'category', 'priority', 'status'];

    /** TCK-1411 (P151.03) — les filtres exacts typés que leur nom ne dit pas (`TypedExactFilter`). */
    protected static array $requestFilterableTypes = ['assigned_to' => TypedExactFilter::IDENTIFIANT];

    protected static array $requestSortable = ['id', 'created_at', 'scheduled_at', 'priority', 'status'];

    protected static array $requestLoadable = ['property', 'lease', 'requester', 'assignee', 'quoteDecisionBy'];

    protected static array $requestSearchFields = ['title', 'description'];

    protected static array $queryFields = [
        'id', 'property_id', 'lease_id', 'requester_id', 'assigned_to',
        'title', 'category', 'priority', 'status',
        'estimated_cost', 'actual_cost', 'quote_amount', 'quote_currency',
        'quote_submitted_at', 'quote_decision_at', 'quote_decision_by_id',
        'scheduled_at', 'completed_at', 'accepted_at', 'quote_valid_until',
        // TCK-2652 — la source de `waiting_since`.
        'queue_entered_at',
        'created_at', 'updated_at',
    ];

    /**
     * TCK-2652 — `queue_entered_at` date l'entrée dans la FILE courante ({@see MaintenanceQueue}) :
     * elle repart à zéro quand le statut change OU quand le destinataire change (`assigned_to` :
     * dispatch, réassignation, refus du prestataire). Décision de la session du 2026-11-11 : un
     * prestataire ne lit pas « en attente depuis 20 jours » une demande reçue il y a une minute. Le
     * passage d'un créneau (`en_cours` → `en_retard`) ne la touche pas : `slot_overdue_days` le dit.
     *
     * Posée par le modèle, quel que soit l'écrivain (machine d'état, devis, assignation, clôture
     * automatique, seeders) ; les deux `saveQuietly()` du dépôt n'écrivent que `metadata`. Une valeur
     * posée explicitement dans la même écriture est respectée. À la création, l'instant est celui que
     * la ligne porte déjà ({@see self::queueEnteredAtOnInsert()}) : une demande créée datée (seeders,
     * import) n'attend pas « depuis aujourd'hui ».
     */
    protected static function booted(): void
    {
        static::saving(function (self $mr): void {
            if (($mr->isDirty('status') || $mr->isDirty('assigned_to')) && ! $mr->isDirty('queue_entered_at')) {
                $mr->queue_entered_at = $mr->exists ? now() : ($mr->queueEnteredAtOnInsert() ?? now());
            }
        });
    }

    /**
     * TCK-2652 — l'entrée dans la file d'une ligne créée déjà datée : la colonne qui date le geste
     * d'entrée, sinon sa création. Même règle que le rétro-remplissage de la migration
     * `add_status_changed_at_to_maintenance_requests`. Nul pour une création ordinaire (ni l'une ni
     * l'autre n'est encore posée) : l'appelant prend alors l'instant courant.
     */
    private function queueEnteredAtOnInsert(): ?CarbonInterface
    {
        $dated = match ($this->status) {
            MaintenanceStatus::QuoteSubmitted => $this->quote_submitted_at,
            MaintenanceStatus::Approved, MaintenanceStatus::Rejected => $this->quote_decision_at,
            MaintenanceStatus::InProgress => $this->started_at,
            MaintenanceStatus::Completed => $this->completed_at,
            default => null,
        };

        return $dated ?? $this->created_at;
    }

    public static function buildQuery(?Builder $baseQuery = null, ?Request $request = null): QueryBuilder
    {
        $subject = $baseQuery ?? static::class;

        return DepartageQueryBuilder::for($subject, $request)
            ->allowedFilters(...static::getAllowedQueryFilters())
            ->allowedSorts(
                'id',
                'created_at',
                'scheduled_at',
                'status',
                AllowedSort::custom('priority', new MaintenancePrioritySort),
            )
            ->allowedFields(...static::getAllAllowedQueryFields())
            ->allowedIncludes(...static::getAllowedQueryIncludes());
    }

    /** TCK-2623 — le fuseau dans lequel se lisent les dates de `filter[scheduled_from|to]`. */
    public const SCHEDULED_TIMEZONE = 'Africa/Dakar';

    /**
     * TCK-2715 — l'horizon du passage : un créneau ne se pose pas au-delà de ce nombre de mois à
     * compter de maintenant, à l'acceptation comme au `PATCH` (`App\Rules\DansLHorizonDuPassage`).
     */
    public const SCHEDULING_HORIZON_MONTHS = 12;

    /** TCK-2715 — le dernier instant admis pour un passage, borne incluse, dans le fuseau de l'application. */
    public static function schedulingHorizon(): CarbonImmutable
    {
        return CarbonImmutable::now(config('app.timezone'))->addMonthsNoOverflow(self::SCHEDULING_HORIZON_MONTHS);
    }

    /**
     * TCK-2700 — l'instant d'un créneau reçu, ramené au fuseau de l'application avant l'écriture. Une
     * heure sans décalage se lit à l'heure de Dakar ; une heure qui porte son décalage, ou un objet
     * date, est l'instant qu'elle désigne. Sans cette conversion, le cast `datetime` écrit l'heure
     * MURALE reçue : `11:00+01:00` était stocké `11:00` UTC, une heure trop tard. Seule conversion du
     * créneau, partagée par le `PATCH` et l'acceptation (TCK-2680).
     */
    public static function scheduledInstant(string|DateTimeInterface $value): CarbonImmutable
    {
        $instant = $value instanceof DateTimeInterface
            ? CarbonImmutable::instance($value)
            : CarbonImmutable::parse($value, self::SCHEDULED_TIMEZONE);

        return $instant->setTimezone(config('app.timezone'));
    }

    /**
     * TCK-2623 — « mes interventions du jour » : `filter[scheduled_from]` / `filter[scheduled_to]`, des
     * DATES lues à l'heure de Dakar, bornes incluses. `from` part du début de son jour, `to` s'arrête
     * avant le début du lendemain ; une intervention sans créneau n'entre dans aucune plage. Une valeur
     * illisible ou une liste rend 422 (`DateBoundaryFilter::exiger`). Elles s'ajoutent aux filtres
     * existants, et le cloisonnement reste celui de {@see self::scopeVisibleTo()}.
     *
     * @return array<int, AllowedFilter>
     */
    protected static function customQueryFilters(): array
    {
        $debutDuJour = fn (string $date): Carbon => Carbon::createFromFormat('!Y-m-d', Carbon::parse($date)->format('Y-m-d'), self::SCHEDULED_TIMEZONE)
            ->setTimezone(config('app.timezone'));

        return [
            // TCK-2652 — `filter[file]=a_dispatcher,en_retard` : les files d'attente
            // ({@see MaintenanceQueue}), plus `a_accepter` pour le prestataire. Une liste à virgules ;
            // une valeur inconnue, ou une liste `filter[file][]=`, ne rend rien.
            AllowedFilter::callback('file', function (Builder $q, mixed $value): void {
                $raw = ParametreUnique::valeur($value);
                $files = $raw === null ? [] : array_values(array_filter(array_map('trim', explode(',', $raw)), fn (string $f) => $f !== ''));
                MaintenanceQueue::scopeToFiles($q, $files, request()->user());
            })->delimiter(''),
            AllowedFilter::callback('scheduled_from', function (Builder $q, mixed $value) use ($debutDuJour): void {
                if ($value === null || $value === '') {
                    return;
                }
                DateBoundaryFilter::exiger($value, 'scheduled_from');
                $q->where($q->qualifyColumn('scheduled_at'), '>=', $debutDuJour($value));
            }),
            AllowedFilter::callback('scheduled_to', function (Builder $q, mixed $value) use ($debutDuJour): void {
                if ($value === null || $value === '') {
                    return;
                }
                DateBoundaryFilter::exiger($value, 'scheduled_to');
                $q->where($q->qualifyColumn('scheduled_at'), '<', $debutDuJour($value)->addDay());
            }),
        ];
    }

    /**
     * Les états où une intervention n'attend plus l'équipe : terminée (en attente de la seule
     * confirmation du demandeur), close, annulée ou refusée. Mêmes quatre que
     * `AgentPortfolio::CLOSED_MAINTENANCE` et le calendrier (TCK-591).
     */
    public const FINISHED_STATUSES = [
        MaintenanceStatus::Completed,
        MaintenanceStatus::Closed,
        MaintenanceStatus::Cancelled,
        MaintenanceStatus::Rejected,
    ];

    /**
     * P127.03 (TCK-1357) — « interventions ouvertes », LE prédicat des tableaux de bord : tout état
     * hors {@see self::FINISHED_STATUSES} (décision du porteur, 2026-10-22). Les tableaux de bord
     * comptaient `open` et `in_progress` seuls, et une demande `acknowledged` ou `assigned` sortait
     * du compteur au moment où elle avançait.
     */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNotIn('status', array_map(
            static fn (MaintenanceStatus $s): string => $s->value,
            self::FINISHED_STATUSES,
        ));
    }

    /**
     * TCK-592 — LE périmètre de lecture d'une liste, aligné sur `MaintenanceRequestPolicy::view()` :
     * demandeur, bailleur du bien, personnel de l'agence du bien (agence du profil actif), prestataire
     * assigné tant qu'il est assignable (collaboration et profil actifs).
     *
     * `index` recopiait la clause `agency_id` de l'ancienne policy : un bailleur de l'agence listait
     * les interventions des autres bailleurs, et un prestataire dont la collaboration avait pris fin
     * listait encore les siennes. TCK-591 (calendrier) réutilise ce scope.
     */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $eligibility = app(ProviderEligibility::class);
        $assignableAgencyIds = $eligibility->agencyIdsWhereAssignable($user);
        $staffAgencyId = $user->staffAgencyId();
        $agencesQuittees = app(MembershipCapabilityResolver::class)->agencesDuPersonnelParti($user);

        return $query->where(function (Builder $q) use ($user, $assignableAgencyIds, $staffAgencyId, $agencesQuittees): void {
            // P233.03 (TCK-2290) — le demandeur, au sens de `MaintenanceRequestPolicy::isRequester` :
            // pas sur un bien d'une agence dont il est du personnel parti (ADR-0031, amendement du
            // 2026-10-25, D2). Le locataire et le client demandeurs n'y ont jamais été personnel.
            $q->where(fn (Builder $requested) => $requested
                ->where('requester_id', $user->id)
                ->when($agencesQuittees !== [], fn (Builder $r) => $r
                    ->whereDoesntHave('property', fn (Builder $p) => $p->whereIn('agency_id', $agencesQuittees))))
                // TCK-2179 (P217.01) — le bailleur du bien, au sens de `view` (`BailleurDuBien::est`,
                // TCK-1720) : l'agent qui l'a saisi est jugé par la branche du personnel ci-dessous.
                ->orWhereHas('property', fn (Builder $p) => BailleurDuBien::restreindre($p, $user))
                ->orWhere(fn (Builder $assigned) => $assigned
                    ->where('assigned_to', $user->id)
                    ->whereHas('property', fn (Builder $p) => $p->whereIn('agency_id', $assignableAgencyIds)));

            if ($staffAgencyId !== null) {
                $q->orWhereHas('property', fn (Builder $p) => $p->where('agency_id', $staffAgencyId));
            }
        });
    }

    public function registerMediaCollections(): void
    {
        // Privées (ADR-0029 §3, décision TCK-538) : l'intérieur d'un logement occupé, vu du seul
        // locataire et de l'agence. Aucun écran public ne les affiche.
        $this->addMediaCollection('photos');
        $this->addMediaCollection('completion_photos');
        $this->addMediaCollection('quotes');
        // TCK-592 (P7) — l'état constaté par le prestataire AVANT d'intervenir.
        $this->addMediaCollection('before_photos');
    }

    /**
     * TCK-2088 (P180.02, ADR-0029, amendement du 2026-10-23) — la vignette que la galerie affiche
     * au lieu de l'original, en file `media`, sur le même disque privé. Servie par la route signée
     * (`PrivateMediaAccess::SERVABLE_CONVERSIONS`). Les devis (`quotes`, souvent des PDF) n'en ont pas.
     */
    public function registerMediaConversions(?Media $media = null): void
    {
        $this->addMediaConversion('thumbnail')
            ->fit(Fit::Max, self::THUMBNAIL_WIDTH, self::THUMBNAIL_WIDTH)
            ->format('jpg')
            ->quality(70)
            ->performOnCollections('photos', 'before_photos', 'completion_photos')
            ->queued();
    }

    /**
     * TCK-281 — n'indexe que l'id et les champs de `$requestSearchFields`.
     *
     * @return array<string,mixed>
     */
    public function toSearchableArray(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
        ];
    }

    public function shouldBeSearchable(): bool
    {
        return ! $this->trashed();
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    /**
     * TCK-600 (ADR-0048 §3, verif-600 O2) — une agence suspendue ne reçoit plus de travail : le
     * prestataire ASSIGNÉ n'écrit plus sur une intervention d'un bien de cette agence. Il ne porte
     * aucun profil d'agence, et le verrou des membres ({@see EnsureAgencyWritable}) ne le voyait
     * pas : il acceptait l'intervention dont le bailleur, lui, ne pouvait plus approuver le devis.
     */
    public function lockedForProvider(User $user): bool
    {
        if ($this->assigned_to === null || (int) $this->assigned_to !== (int) $user->getKey()) {
            return false;
        }

        $agencyId = $this->property?->agency_id;

        return $agencyId !== null
            && Agency::query()->whereKey($agencyId)->where('status', AgencyStatus::Suspended)->exists();
    }

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function quoteDecisionBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'quote_decision_by_id');
    }

    /**
     * TCK-2372 (P250.03, décision du porteur du 2026-10-25) — LE fil de l'intervention, et sa seule
     * lecture : le plus ancien groupe qui porte la demande. Le `HasOne` nu ne filtrait ni le type ni
     * l'ordre, et le fil se lisait ailleurs (`SyncMaintenanceConversation::conversationFor`, retiré).
     * Seule l'assignation crée ce groupe : `POST /api/conversations` refuse `maintenance_request_id`.
     */
    public function conversation(): HasOne
    {
        return $this->hasOne(Conversation::class)->ofMany(
            ['id' => 'min'],
            fn ($query) => $query->where('type', ConversationType::Group->value),
        );
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }

    /** TCK-601 (ADR-0044 §3) — l'agence d'une activité sur cette ligne est celle du bien. */
    public function auditAgencyId(): ?int
    {
        $agencyId = $this->property()->value('agency_id');

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
