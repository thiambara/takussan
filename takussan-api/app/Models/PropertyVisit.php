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
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
        $filters[] = AllowedFilter::callback('to_close', function (Builder $q, mixed $value) {
            if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                $q->toClose();
            }
        });

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
