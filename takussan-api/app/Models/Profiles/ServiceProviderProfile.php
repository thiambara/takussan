<?php

namespace App\Models\Profiles;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Services\Maintenance\MaintenanceJournal;
use App\Support\CaseInsensitive;
use Database\Factories\Profiles\ServiceProviderProfileFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;
use Spatie\QueryBuilder\AllowedFilter;

class ServiceProviderProfile extends AbstractModel
{
    /** @use HasFactory<ServiceProviderProfileFactory> */
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'status',
        'specialties', 'service_areas',
        'insurance_policy_id', 'certifications',
        'hourly_rate_min', 'hourly_rate_max',
        'active_until', 'metadata',
    ];

    protected $casts = [
        'status' => ServiceProviderProfileStatus::class,
        'specialties' => 'array',
        'service_areas' => 'array',
        'certifications' => 'array',
        'hourly_rate_min' => 'decimal:2',
        'hourly_rate_max' => 'decimal:2',
        'active_until' => 'date',
        'metadata' => 'array',
    ];

    /**
     * spatie/laravel-query-builder hooks. Listing surface
     * (`/app/maintenance/providers`) consomme ces filtres + sparse
     * fieldsets côté front — voir CLAUDE.md "API — conventions frontend".
     */
    protected static array $requestFilterable = ['status', 'user_id'];

    protected static array $requestSortable = ['id', 'created_at', 'status'];

    protected static array $requestLoadable = ['user', 'agencyCollaborations', 'agencies', 'invitations'];

    protected static array $requestSearchFields = ['insurance_policy_id'];

    protected static array $queryFields = [
        'id', 'user_id', 'status',
        'specialties', 'service_areas',
        'insurance_policy_id', 'certifications',
        'hourly_rate_min', 'hourly_rate_max',
        'active_until', 'metadata',
        'created_at', 'updated_at',
    ];

    /**
     * TCK-597 (ADR-0043 §2) — les avis sur le PROFIL prestataire, pas sur le `User` : un agent qui
     * est aussi prestataire ne mêle pas ses deux réputations. Moyenne lue à la demande (`withAvg`).
     */
    public function reviews(): MorphMany
    {
        return $this->morphMany(Review::class, 'reviewable');
    }

    /**
     * TCK-1325 (P117.06) — la pièce d'assurance VIVANTE du profil : non supprimée (`SoftDeletes`),
     * non expirée, et dont le fichier est présent. C'est d'elle que se dérive le badge « Assuré »
     * du carnet (`withExists`), et non d'un drapeau recopié en `metadata`, qui ne se remettait
     * jamais à faux.
     */
    public function liveInsuranceDocuments(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable')
            ->where('type', DocumentType::Insurance)
            ->where(fn (Builder $q) => $q->whereNull('expiry_date')->orWhereDate('expiry_date', '>=', now()->toDateString()))
            ->whereHas('media', fn (Builder $q) => $q->where('collection_name', 'file'));
    }

    /**
     * TCK-592 — le carnet d'une agence se filtre par métier, par zone et par statut de collaboration.
     *
     * `collaboration_status` est déclaré ici pour que spatie l'accepte, mais il n'agit PAS ici : un
     * profil collabore avec N agences, et le statut qui compte est celui du couple (profil, agence de
     * l'écran). C'est `ServiceProviderProfileController::scopeForAgency()` qui l'applique, défaut
     * compris (`active` + invitations en attente de l'agence, TCK-2829) — un filtre `whereHas` posé
     * ici retiendrait une collaboration ACTIVE AILLEURS.
     *
     * @return array<int, AllowedFilter>
     */
    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback('collaboration_status', static fn (): null => null),
            AllowedFilter::callback('specialty', static fn (Builder $q, mixed $value) => $q->where(
                static fn (Builder $inner) => collect((array) $value)->each(
                    static fn ($v) => $inner->orWhereJsonContains('specialties', (string) $v),
                ),
            )),
            AllowedFilter::callback('zone', static fn (Builder $q, mixed $value) => $q->where(
                static fn (Builder $inner) => collect((array) $value)->each(
                    static fn ($v) => $inner->orWhereJsonContains('service_areas', (string) $v),
                ),
            )),
        ];
    }

    /**
     * TCK-2772 — le carnet se cherche aussi par le nom et le téléphone : ceux du compte lié (`users`),
     * sinon ceux saisis à l'invitation (`metadata`) ; et par le quartier, une de ses zones. Un terme fait de chiffres (« 77 538 41 06 »,
     * « +221 77… ») cherche aussi le numéro sans ses séparateurs : les numéros sont rangés en E.164.
     * Posées DANS le groupe `OR` de `filter[search]` ({@see HasQueryBuilder}), ces clauses restent
     * sous le périmètre de l'agence que le contrôleur impose.
     */
    protected static function extraSearchClauses(Builder $inner, string $motif, string $valeur): void
    {
        $chiffres = preg_match('/^[\d\s.+\-()]+$/', $valeur) === 1 ? preg_replace('/\D/', '', $valeur) : '';
        $motifs = array_values(array_unique(array_filter([$motif, strlen((string) $chiffres) >= 3 ? '%'.$chiffres.'%' : null])));

        $inner->orWhereHas('user', function (Builder $compte) use ($motif, $motifs): void {
            $compte->where(function (Builder $q) use ($motif, $motifs): void {
                $q->whereRaw(CaseInsensitive::sql('users.first_name').' like ?', [$motif])
                    ->orWhereRaw(CaseInsensitive::sql('users.last_name').' like ?', [$motif])
                    ->orWhereRaw("LOWER(concat_ws(' ', users.first_name, users.last_name) COLLATE \"".CaseInsensitive::COLLATION.'") like ?', [$motif]);
                foreach ($motifs as $m) {
                    $q->orWhereRaw('users.phone like ?', [$m]);
                }
            });
        });

        foreach (['first_name', 'last_name'] as $cle) {
            $inner->orWhereRaw(CaseInsensitive::sqlCleJson('service_provider_profiles.metadata', $cle).' like ?', [$motif]);
        }
        $inner->orWhereRaw(
            "LOWER(concat_ws(' ', service_provider_profiles.metadata->>'first_name', service_provider_profiles.metadata->>'last_name') COLLATE \"".CaseInsensitive::COLLATION.'") like ?',
            [$motif],
        );
        foreach ($motifs as $m) {
            $inner->orWhereRaw("service_provider_profiles.metadata->>'phone' like ?", [$m]);
        }
        // Le quartier : une zone servie (« Sacré-Cœur »), lue dans le texte du tableau `service_areas`.
        $inner->orWhereRaw('LOWER(service_provider_profiles.service_areas::text COLLATE "'.CaseInsensitive::COLLATION.'") like ?', [$motif]);
    }

    /**
     * TCK-2772 — les zones distinctes d'un carnet (`service_areas` des profils de la requête reçue),
     * dans l'ordre de la collation racine : `École` se range avec les `E`, pas après `Z` comme sous
     * `--locale=C`. Les chaînes sont rendues telles quelles : `filter[zone]` les compare exactement.
     *
     * @return list<string>
     */
    public static function zonesOf(Builder $carnet): array
    {
        $profils = (clone $carnet)->select('service_provider_profiles.service_areas')
            ->whereRaw("jsonb_typeof(service_provider_profiles.service_areas) = 'array'");
        $zones = DB::query()->fromSub($profils, 'carnet')
            ->selectRaw('distinct jsonb_array_elements_text(carnet.service_areas) as zone');

        return DB::query()->fromSub($zones, 'zones')
            ->whereRaw("trim(zones.zone) <> ''")
            ->orderByRaw('zones.zone COLLATE "'.CaseInsensitive::COLLATION.'"')
            ->pluck('zone')
            ->map(fn ($zone): string => (string) $zone)
            ->values()
            ->all();
    }

    /**
     * TCK-2772 — le délai de réponse médian, en minutes, du prestataire pour UNE agence : sur les
     * demandes des biens de l'agence (supprimés compris) qui lui sont assignées et qu'il a acceptées
     * (`accepted_at` : « J'accepte », ou le démarrage par lui), l'écart entre la dernière assignation
     * au journal (`status.assigned`, TCK-2786) antérieure à l'acceptation et l'acceptation. Nul sans
     * aucune paire : le journal n'a pas de reprise, une demande assignée avant lui ne compte pas.
     */
    public static function responseDelaySubquery(int $agencyId): Builder
    {
        $assignation = Activity::query()
            ->selectRaw('max(activity_log.created_at)')
            ->where('activity_log.log_name', MaintenanceJournal::LOG)
            ->where('activity_log.subject_type', (new MaintenanceRequest)->getMorphClass())
            ->whereColumn('activity_log.subject_id', 'maintenance_requests.id')
            ->where('activity_log.event', MaintenanceJournal::STATUS_PREFIX.MaintenanceStatusChanged::CAUSE_ASSIGNED)
            ->whereColumn('activity_log.created_at', '<=', 'maintenance_requests.accepted_at');

        return MaintenanceRequest::query()
            ->selectRaw(
                'round(percentile_cont(0.5) within group (order by extract(epoch from (maintenance_requests.accepted_at - ('.$assignation->toSql().'))) / 60))::int',
                $assignation->getBindings(),
            )
            ->whereColumn('maintenance_requests.assigned_to', 'service_provider_profiles.user_id')
            ->whereNotNull('maintenance_requests.accepted_at')
            ->whereIn('maintenance_requests.property_id', Property::withTrashed()->select('id')->where('agency_id', $agencyId));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * TCK-2652 — les interventions RÉALISÉES par ce prestataire pour une agence : assignées à son
     * compte, rendues (`completed`) ou closes après rendu (`closed`, qu'on n'atteint que depuis
     * `completed`), sur un bien de l'agence, supprimé compris. Sous-requête corrélée, à poser par
     * `addSelect` : le carnet et les suggestions la lisent sans requête par ligne.
     */
    public static function completedInterventionsSubquery(int $agencyId): Builder
    {
        return MaintenanceRequest::query()
            ->selectRaw('count(*)')
            ->whereColumn('maintenance_requests.assigned_to', 'service_provider_profiles.user_id')
            ->whereIn('maintenance_requests.status', [MaintenanceStatus::Completed->value, MaintenanceStatus::Closed->value])
            ->whereIn('maintenance_requests.property_id', Property::withTrashed()->select('id')->where('agency_id', $agencyId));
    }

    /**
     * TCK-2652 — le téléphone du compte lié, lu par sous-requête corrélée ; le carnet retombe sur
     * `metadata.phone` (le numéro saisi à l'invitation) quand le compte n'en a pas ou n'existe pas.
     */
    public static function accountPhoneSubquery(): Builder
    {
        return User::query()->select('phone')->whereColumn('users.id', 'service_provider_profiles.user_id');
    }

    public function agencyCollaborations(): HasMany
    {
        return $this->hasMany(ServiceProviderAgencyCollaboration::class);
    }

    public function agencies(): BelongsToMany
    {
        return $this->belongsToMany(
            Agency::class,
            'service_provider_agency_collaborations',
            'service_provider_profile_id',
            'agency_id',
        )->withPivot(['status', 'started_at', 'ended_at', 'metadata'])
            ->withTimestamps();
    }

    /**
     * TCK-260 — invitations émises pour ce profil draft. Mirror
     * OwnerProfile::invitations() pour exposer le statut d'invitation
     * (envoyée/expirée) côté UI sans round-trip supplémentaire.
     */
    public function invitations(): MorphMany
    {
        return $this->morphMany(Invitation::class, 'invitable');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', ServiceProviderProfileStatus::Active->value);
    }

    /**
     * TCK-260 — convenience : email cible du draft, lu depuis le metadata
     * tant qu'aucun User n'est attaché. À l'acceptation, l'invitation
     * crée le User et `user->email` devient l'unique source de vérité.
     */
    public function getDraftEmailAttribute(): ?string
    {
        if ($this->user !== null) {
            return $this->user->email;
        }

        return data_get($this->metadata, 'email');
    }

    /**
     * TCK-260 — convenience : nom complet à afficher pour un draft
     * (avant qu'un User ne soit créé) ou pour un profil actif.
     */
    public function getDisplayNameAttribute(): string
    {
        // P234.07 (TCK-2280) — un compte lié sans nom (créé par téléphone, noms `''`) laisse place
        // au nom saisi par l'agence à l'invitation, comme au front depuis TCK-2136.
        $account = $this->user !== null
            ? trim(($this->user->first_name ?? '').' '.($this->user->last_name ?? ''))
            : '';
        if ($account !== '') {
            return $account;
        }

        $first = (string) data_get($this->metadata, 'first_name', '');
        $last = (string) data_get($this->metadata, 'last_name', '');

        return trim($first.' '.$last);
    }
}
