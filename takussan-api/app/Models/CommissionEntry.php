<?php

namespace App\Models;

use App\Http\Filters\DateBoundaryFilter;
use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\CommissionCancelReason;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\CommissionOrigin;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentMethod;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\AllowedInclude;

/**
 * TCK-595 (ADR-0049 §3) — une ligne du grand livre des commissions : la part d'un bénéficiaire sur
 * la commission d'un bail, figée à l'activation par `CommissionLedgerService::generateFor()`.
 *
 * Elle ne se recalcule jamais depuis le bail ni depuis les parts courantes des collaborateurs : seul
 * l'admin la fait changer d'état (`due` → `paid` | `cancelled`), et `Auditable` journalise le geste
 * sous le nom `CommissionEntry`.
 */
class CommissionEntry extends AbstractModel
{
    use Auditable, HasFactory;

    protected $fillable = [
        'agency_id', 'lease_id', 'beneficiary_id', 'origin',
        'base_amount', 'share_percent', 'amount', 'currency', 'status',
        'earned_at', 'paid_at', 'paid_by_id', 'cancelled_at', 'cancelled_by_id', 'metadata',
        // TCK-2661 — la preuve du paiement et le motif de l'annulation.
        'payment_method', 'payment_reference', 'cancel_reason_code', 'cancel_reason',
    ];

    /** TCK-2661 — le fuseau dans lequel se lisent les dates des filtres `earned_*` et `paid_*`. */
    public const DATE_TIMEZONE = 'Africa/Dakar';

    protected $casts = [
        'origin' => CommissionOrigin::class,
        'status' => CommissionEntryStatus::class,
        'currency' => Currency::class,
        'base_amount' => 'decimal:2',
        'share_percent' => 'decimal:2',
        'amount' => 'decimal:2',
        'earned_at' => 'datetime',
        'paid_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'metadata' => 'array',
        'payment_method' => PaymentMethod::class,
        'cancel_reason_code' => CommissionCancelReason::class,
    ];

    protected static array $requestFilterable = ['status', 'beneficiary_id', 'lease_id', 'origin'];

    protected static array $requestSortable = ['id', 'earned_at', 'amount', 'paid_at'];

    protected static array $requestLoadable = ['lease', 'beneficiary'];

    protected static array $queryFields = [
        'id', 'agency_id', 'lease_id', 'beneficiary_id', 'origin',
        'base_amount', 'share_percent', 'amount', 'currency', 'status',
        'earned_at', 'paid_at', 'paid_by_id', 'cancelled_at', 'cancelled_by_id',
        'payment_method', 'payment_reference', 'cancel_reason_code', 'cancel_reason',
        'created_at', 'updated_at',
    ];

    /**
     * TCK-2661 — `filter[earned_from|earned_to|paid_from|paid_to]` : des DATES lues à l'heure de
     * Dakar, bornes incluses, comme `MaintenanceRequest::customQueryFilters()` (TCK-2623). `from` part
     * du début de son jour, `to` s'arrête avant le début du lendemain ; une ligne non payée n'entre
     * dans aucune plage `paid_*`. Une valeur illisible ou une liste rend 422.
     *
     * @return array<int, AllowedFilter>
     */
    protected static function customQueryFilters(): array
    {
        $filters = [];
        foreach (['earned' => 'earned_at', 'paid' => 'paid_at'] as $name => $column) {
            $filters[] = AllowedFilter::callback("{$name}_from", function (Builder $q, mixed $value) use ($name, $column): void {
                if ($value === null || $value === '') {
                    return;
                }
                DateBoundaryFilter::exiger($value, "{$name}_from");
                $q->where($q->qualifyColumn($column), '>=', self::startOfDakarDay($value));
            });
            $filters[] = AllowedFilter::callback("{$name}_to", function (Builder $q, mixed $value) use ($name, $column): void {
                if ($value === null || $value === '') {
                    return;
                }
                DateBoundaryFilter::exiger($value, "{$name}_to");
                $q->where($q->qualifyColumn($column), '<', self::startOfDakarDay($value)->addDay());
            });
        }

        return $filters;
    }

    /** Le début, en heure de l'application, du jour de Dakar que porte la date donnée. */
    public static function startOfDakarDay(string $date): Carbon
    {
        return Carbon::createFromFormat('!Y-m-d', Carbon::parse($date)->format('Y-m-d'), self::DATE_TIMEZONE)
            ->setTimezone(config('app.timezone'));
    }

    /**
     * TCK-2661 — `include=lease.property` : le bien du bail, `{id, title, quarter}` sous `lease`.
     * Déclaré ici et non dans `$requestLoadable`, qui ne nomme que des relations du modèle (et que
     * `RequestLoadableEmittedTest` confronte à la ressource) : celle-ci est celle du bail.
     *
     * @return array<int, AllowedInclude>
     */
    protected static function getAllowedQueryIncludes(): array
    {
        return [...parent::getAllowedQueryIncludes(), AllowedInclude::relationship('lease.property')];
    }

    /**
     * TCK-595 (ADR-0049 §3, verif-595 M2) — le périmètre de lecture du grand livre, UN SEUL pour le
     * relevé (`GET /api/commissions`) et pour l'export : le personnel de l'agence active ne lit que ses
     * lignes, sauf sous `AgencyPolicy::viewReports`, qui ouvre toute l'agence. Le super-admin lit tout.
     * Hors personnel : rien. L'export filtrait par la seule agence, et rendait à un agent porteur de
     * `reports.export` la rémunération nominative de ses collègues, que le relevé lui refuse.
     *
     * @param  Builder<self>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if ($user->isSuperAdmin()) {
            return;
        }

        $agencyId = $user->staffAgencyId();
        if ($agencyId === null) {
            $query->whereRaw('1 = 0');

            return;
        }

        $query->where('commission_entries.agency_id', $agencyId);
        $agency = Agency::query()->find($agencyId);
        if ($agency === null || ! $user->can('viewReports', $agency)) {
            $query->where('commission_entries.beneficiary_id', $user->id);
        }
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function beneficiary(): BelongsTo
    {
        return $this->belongsTo(User::class, 'beneficiary_id');
    }
}
