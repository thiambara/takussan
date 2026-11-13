<?php

namespace App\Models;

use App\Http\Filters\RangeFilter;
use App\Jobs\SendPropertyVisitReminders;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\VisitFollowUp;
use App\Models\Enums\VisitReportOutcome;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Enums\VisitWindow;
use App\Rules\JourIso;
use App\Rules\PersonnelDeLAgence;
use App\Services\Visit\VisitSchedulingService;
use App\Support\CaseInsensitive;
use App\Support\Http\ParametreUnique;
use App\Support\TelephoneSaisi;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Validator;
use Spatie\QueryBuilder\AllowedFilter;

class PropertyVisit extends AbstractModel
{
    use HasFactory;

    /**
     * TCK-1527 (P169.01) — les marques de {@see SendPropertyVisitReminders}. Elles valent
     * pour l'heure qu'elles ont rappelée : tout changement de `scheduled_at` les retire, quel que
     * soit le geste (report du visiteur, déplacement par l'agence), pour que le nouveau créneau
     * reçoive ses deux rappels, 24 h et 1 h avant (`docs/features.md`, visites).
     */
    public const REMINDER_MARKERS = ['reminder_24h_sent_at', 'reminder_1h_sent_at'];

    protected static function booted(): void
    {
        static::updating(function (PropertyVisit $visit) {
            if (! $visit->isDirty('scheduled_at')) {
                return;
            }
            // TCK-2502 — une heure posée (confirmation, report, déplacement par l'agence) n'est
            // plus « l'après-midi, heure à fixer » : la tranche tombe, sauf si l'écrivain la pose
            // lui-même dans le même geste.
            if (! $visit->isDirty('preferred_window')) {
                $visit->preferred_window = null;
            }
            $metadata = $visit->metadata ?? [];
            $sansMarques = array_diff_key($metadata, array_flip(self::REMINDER_MARKERS));
            if ($sansMarques !== $metadata) {
                $visit->metadata = $sansMarques;
            }
        });
    }

    protected $fillable = [
        'property_id', 'visitor_id', 'customer_id', 'agent_id',
        'visitor_name', 'visitor_phone', 'visitor_email',
        'type', 'status', 'scheduled_at', 'duration_minutes',
        // TCK-2502 — la tranche demandée quand l'heure reste à fixer (`VisitWindow`).
        'preferred_window',
        'completed_at', 'cancelled_at', 'cancellation_reason',
        'feedback', 'rating', 'notes', 'metadata',
        // TCK-590 — d'où vient la demande, et dans quelle langue prévenir un visiteur sans compte.
        'source', 'medium', 'locale',
        // TCK-2582 — la demande de contact qui a amené la visite (`POST /api/property-visits`).
        'contact_lead_id',
        // TCK-2578 (ADR-0101) — le compte rendu de l'agence, écrit par `VisitReportService` seul.
        'report_outcome', 'report_objections', 'report_note', 'report_follow_up',
        'reported_at', 'reported_by_id',
    ];

    /**
     * TCK-2578 (ADR-0101 § 2) — le compte rendu ne sort que par `PropertyVisitResource`, qui le
     * réserve au personnel : une visite sérialisée telle quelle (relation imbriquée, `toArray()`)
     * ne l'emporte pas.
     */
    protected $hidden = [
        'report_outcome', 'report_objections', 'report_note', 'report_follow_up',
        'reported_at', 'reported_by_id',
    ];

    protected $casts = [
        'type' => VisitType::class,
        'status' => VisitStatus::class,
        'scheduled_at' => 'datetime',
        'preferred_window' => VisitWindow::class,
        'completed_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'rating' => 'decimal:1',
        'metadata' => 'array',
        'report_outcome' => VisitReportOutcome::class,
        'report_objections' => 'array',
        'report_follow_up' => VisitFollowUp::class,
        'reported_at' => 'datetime',
        // TCK-2591 — l'heure de la confirmation, posée par le modèle ({@see self::markConfirmation()}).
        'confirmed_at' => 'datetime',
    ];

    protected static array $requestFilterable = ['property_id', 'visitor_id', 'customer_id', 'agent_id', 'type', 'status'];

    /**
     * TCK-075 — `scheduled_at_min` / `scheduled_at_max` power the "À venir /
     * Passées" tabs on the frontend (`/app/visits`). Spatie exposes them as
     * `filter[scheduled_at_min]=…` via {@see RangeFilter}.
     */
    protected static array $requestRangeFilters = ['scheduled_at'];

    protected static array $requestSortable = ['id', 'created_at', 'scheduled_at', 'status'];

    protected static array $requestLoadable = ['property', 'visitor', 'customer', 'agent'];

    /**
     * TCK-2591 (ADR-0103 § 5) — « visite confirmée » est un fait daté du pipeline : chaque passage
     * en `confirmed` pose `confirmed_at`. Ici et non dans un écouteur : les seeders écrivent sous
     * `withoutEvents()`. Une visite repassée en attente puis reconfirmée prend la nouvelle heure.
     */
    protected function performInsert(Builder $query)
    {
        $this->markConfirmation();

        return parent::performInsert($query);
    }

    protected function performUpdate(Builder $query)
    {
        $this->markConfirmation();

        return parent::performUpdate($query);
    }

    private function markConfirmation(): void
    {
        if ($this->isDirty('status') && $this->status === VisitStatus::Confirmed && ! $this->isDirty('confirmed_at')) {
            $this->setAttribute('confirmed_at', $this->freshTimestamp());
        }
    }

    protected static array $queryFields = [
        'id', 'property_id', 'visitor_id', 'customer_id', 'agent_id',
        'visitor_name', 'visitor_phone', 'visitor_email',
        'type', 'status', 'scheduled_at', 'preferred_window', 'completed_at', 'duration_minutes',
        'cancelled_at', 'cancellation_reason', 'feedback', 'rating', 'notes', 'metadata',
        'source', 'medium', 'locale',
        // TCK-2578 — servis au seul personnel par `PropertyVisitResource` (bloc `report`).
        'report_outcome', 'report_objections', 'report_note', 'report_follow_up',
        'reported_at', 'reported_by_id',
        'created_at', 'updated_at',
    ];

    /**
     * TCK-590 — `filter[unassigned]=1` : les visites sans agent, à prendre en charge ;
     * `filter[mine]=1` : celles dont je suis l'agent.
     *
     * @return array<int, AllowedFilter>
     */
    protected static function getAllowedQueryFilters(): array
    {
        $filters = parent::getAllowedQueryFilters();

        $filters[] = AllowedFilter::callback('unassigned', function (Builder $q, mixed $value) {
            if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                $q->whereNull('agent_id');
            }
        });

        $filters[] = AllowedFilter::callback('mine', function (Builder $q, mixed $value) {
            $userId = request()->user()?->id;
            if (filter_var($value, FILTER_VALIDATE_BOOLEAN) && $userId !== null) {
                $q->where('agent_id', $userId);
            }
        });

        // TCK-2578 (ADR-0101 § 6) — « À clore » : confirmée dont l'heure est passée, ou terminée
        // sans compte rendu depuis au plus `visits.report_pending_days` jours.
        // TCK-2587 — et seulement là où le lecteur peut clore (`PropertyVisitPolicy::report`) : le
        // personnel actif de l'agence du bien. Le visiteur, le bailleur ou le prestataire n'ont rien
        // « à clore » ; `counts` pose la même borne (`PropertyVisitController::closableBound`).
        $filters[] = AllowedFilter::callback('to_close', function (Builder $q, mixed $value) {
            if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                $q->toClose();
                $viewer = request()->user();
                if ($viewer?->isSuperAdmin() !== true) {
                    $staff = $viewer === null ? [] : PersonnelDeLAgence::agencesOuPersonnelActif($viewer);
                    $q->whereHas('property', fn (Builder $p) => $p->whereIn('agency_id', $staff));
                }
            }
        });

        // TCK-2585 — `filter[search]` : nom ou téléphone du visiteur, titre du bien. Le nom et le
        // téléphone ne se cherchent que là où le lecteur les LIT (`PropertyVisitResource` les masque
        // sur une visite à fiche hors du personnel de l'agence du bien) : sinon la recherche dirait
        // au bailleur qu'un client de l'agence porte ce nom.
        // TCK-2587 — et le nom et le téléphone de la FICHE client liée : c'est eux que la console
        // affiche (`visitor_display` : le nom de la fiche d'abord, le téléphone saisi d'abord).
        // Chaque mot doit se trouver dans le prénom ou le nom (« Abdoulaye Ciss » trouve Abdoulaye
        // Cissé) — et, de même, dans le nom saisi de la visite. La fiche ne se cherche que sous la même condition que le nom saisi : le lecteur est
        // du personnel de l'agence du bien.
        $filters[] = AllowedFilter::callback('search', function (Builder $q, mixed $value) {
            $value = trim(ParametreUnique::valeur($value) ?? '');
            if ($value === '') {
                return;
            }
            $motif = '%'.addcslashes(CaseInsensitive::fold($value), '\\%_').'%';
            $mots = array_map(
                fn (string $mot) => '%'.addcslashes(CaseInsensitive::fold($mot), '\\%_').'%',
                preg_split('/\s+/u', $value, -1, PREG_SPLIT_NO_EMPTY) ?: [],
            );
            // TCK-2587 (contre-vérification, m1) — les chiffres saisis, et ceux du numéro passé par le
            // normaliseur de saisie commun (`TelephoneSaisi::normaliser`) : « 00221 77… » y devient
            // « +22177… », et se trouve comme « +221 77… » ; la saisie brute reste cherchée telle quelle
            // (un numéro stocké sans indicatif). Trois chiffres au moins.
            $chiffres = array_values(array_unique(array_filter(
                [preg_replace('/\D+/', '', $value) ?? '', preg_replace('/\D+/', '', (string) TelephoneSaisi::normaliser($value)) ?? ''],
                fn (string $c) => strlen($c) >= 3,
            )));
            $viewer = request()->user();
            $toutVoir = $viewer?->isSuperAdmin() === true;
            $staff = $viewer === null ? [] : PersonnelDeLAgence::agencesOuPersonnelActif($viewer);

            $q->where(function (Builder $w) use ($motif, $mots, $chiffres, $toutVoir, $staff) {
                $w->whereHas('property', fn (Builder $p) => $p->whereRaw(CaseInsensitive::sql('title').' like ?', [$motif]))
                    ->orWhere(function (Builder $personne) use ($mots, $chiffres, $toutVoir, $staff) {
                        $personne->where(function (Builder $champ) use ($mots, $chiffres) {
                            // Suivi de TCK-2587 (re-mesuré le 2026-11-12) — le nom saisi se cherche mot par
                            // mot, comme celui de la fiche : « Fatou Diallo » trouvait « Fatou Diallo » et
                            // non « Fatou B. Diallo », que la fiche, elle, trouvait.
                            $champ->where(function (Builder $nom) use ($mots) {
                                foreach ($mots as $mot) {
                                    $nom->whereRaw(CaseInsensitive::sql('property_visits.visitor_name').' like ?', [$mot]);
                                }
                            });
                            foreach ($chiffres as $numero) {
                                $champ->orWhere('property_visits.visitor_phone', 'like', '%'.$numero.'%');
                            }
                            $champ->orWhereHas('customer', function (Builder $fiche) use ($mots, $chiffres) {
                                $fiche->where(function (Builder $nomOuNumero) use ($mots, $chiffres) {
                                    $nomOuNumero->where(function (Builder $nom) use ($mots) {
                                        foreach ($mots as $mot) {
                                            $nom->where(fn (Builder $l) => $l
                                                ->whereRaw(CaseInsensitive::sql('customers.first_name').' like ?', [$mot])
                                                ->orWhereRaw(CaseInsensitive::sql('customers.last_name').' like ?', [$mot]));
                                        }
                                    });
                                    foreach ($chiffres as $numero) {
                                        $nomOuNumero->orWhere('customers.phone', 'like', '%'.$numero.'%');
                                    }
                                });
                            });
                        });
                        if (! $toutVoir) {
                            $personne->where(fn (Builder $lisible) => $lisible
                                ->whereNull('property_visits.customer_id')
                                ->orWhereHas('property', fn (Builder $p) => $p->whereIn('agency_id', $staff)));
                        }
                    });
            });
        })->delimiter('');

        // TCK-2585 — `filter[day]=YYYY-MM-DD` : la journée de Dakar, raccourci de
        // `scheduled_at_min`/`scheduled_at_max` (début inclus, lendemain exclu).
        $filters[] = AllowedFilter::callback('day', function (Builder $q, mixed $value) {
            // Comme `RangeFilter` : une valeur mal formée (ou un tableau) rend 422 sur `filter.day`.
            Validator::make(['filter' => ['day' => $value]], [
                'filter.day' => ['string', 'date_format:Y-m-d', new JourIso], // TCK-2768 r1 — l'année bornée
            ])->validate();
            $parsed = CarbonImmutable::createFromFormat('!Y-m-d', (string) $value, VisitSchedulingService::TIMEZONE);
            $q->where('property_visits.scheduled_at', '>=', $parsed->utc())
                ->where('property_visits.scheduled_at', '<', $parsed->addDay()->utc());
        })->delimiter('');

        return $filters;
    }

    /** TCK-2578 — la définition d'« À clore », une seule fois (filtre et lecteurs à venir). */
    public function scopeToClose(Builder $query): Builder
    {
        $now = now();
        $days = max(0, (int) config('visits.report_pending_days', 7));

        return $query->where(fn (Builder $w) => $w
            ->where(fn (Builder $c) => $c
                ->where('status', VisitStatus::Confirmed->value)
                ->where('scheduled_at', '<=', $now))
            ->orWhere(fn (Builder $c) => $c
                ->where('status', VisitStatus::Completed->value)
                ->whereNull('reported_at')
                ->where('completed_at', '>=', $now->copy()->subDays($days))));
    }

    /** TCK-2578 — la visite confirmée dont l'heure est passée : le compte rendu la clôt d'un geste. */
    public function isClosableByReport(): bool
    {
        return $this->status === VisitStatus::Completed
            || ($this->status === VisitStatus::Confirmed
                && $this->scheduled_at !== null
                && $this->scheduled_at->lessThanOrEqualTo(now()));
    }

    public function hasReport(): bool
    {
        return $this->reported_at !== null;
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function visitor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'visitor_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function agent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'agent_id');
    }

    public function reportedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_by_id');
    }
}
