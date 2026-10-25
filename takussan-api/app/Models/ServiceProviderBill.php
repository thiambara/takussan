<?php

namespace App\Models;

use App\Http\Filters\TypedExactFilter;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\Currency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * TCK-594 (ADR-0039 §8) — la facture d'intervention : pièce REÇUE d'un prestataire, quand `Invoice`
 * est une pièce émise vers un `Customer`.
 *
 * Elle naît de `MaintenanceRequestObserver` au passage à `completed`, se valide ou se rejette par
 * l'agence, et se paie par un `Payout` `payee_role = service_provider` — la même chaîne de quatre
 * yeux que les reversements au bailleur. Refacturable, elle entre dans les FRAIS du reversement au
 * bailleur du bien (`imputed_payout_id`).
 *
 * TCK-2270 (P224.01, ADR-0039 § 8, amendement du 2026-10-25) : elle ne se valide, ne se paie et ne
 * s'impute que pour un travail rendu ({@see self::BILLABLE_REQUEST_STATUSES}) ; la contestation et
 * l'annulation de l'intervention l'annulent, ou la gardent si elle est déjà engagée.
 */
class ServiceProviderBill extends AbstractModel
{
    use HasFactory;

    /** Les états d'une intervention dont le travail est rendu : seuls ils valident, paient et imputent sa facture. */
    public const BILLABLE_REQUEST_STATUSES = [MaintenanceStatus::Completed, MaintenanceStatus::Closed];

    protected $fillable = [
        'maintenance_request_id', 'agency_id', 'property_id', 'provider_id',
        'reference_number', 'provider_reference', 'amount', 'currency', 'exceeds_quote', 'status',
        'validated_by_id', 'validated_at', 'rejection_reason', 'rechargeable_to_landlord',
        'imputed_payout_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'currency' => Currency::class,
        'exceeds_quote' => 'boolean',
        'status' => ServiceProviderBillStatus::class,
        'validated_at' => 'datetime',
        'rechargeable_to_landlord' => 'boolean',
    ];

    protected static array $requestFilterable = ['agency_id', 'property_id', 'provider_id', 'maintenance_request_id', 'status', 'rechargeable_to_landlord'];

    /** TCK-1411 (P151.03) — les filtres exacts typés que leur nom ne dit pas (`TypedExactFilter`). */
    protected static array $requestFilterableTypes = ['rechargeable_to_landlord' => TypedExactFilter::BOOLEEN];

    protected static array $requestSortable = ['id', 'created_at', 'amount', 'validated_at'];

    protected static array $requestLoadable = ['maintenanceRequest', 'property', 'provider', 'payouts'];

    protected static array $queryFields = [
        'id', 'maintenance_request_id', 'agency_id', 'property_id', 'provider_id',
        'reference_number', 'provider_reference', 'amount', 'currency', 'exceeds_quote', 'status',
        'validated_by_id', 'validated_at', 'rejection_reason', 'rechargeable_to_landlord',
        'imputed_payout_id', 'created_at', 'updated_at',
    ];

    /** L'intervention de la facture est-elle, À CET INSTANT, dans un état de travail rendu ? Relue en base. */
    public function requestIsBillable(): bool
    {
        return self::query()->whereKey($this->getKey())->whereRequestBillable()->exists();
    }

    /**
     * @param  Builder<ServiceProviderBill>  $query
     * @return Builder<ServiceProviderBill>
     */
    public function scopeWhereRequestBillable(Builder $query): Builder
    {
        $table = $this->getTable();

        return $query->whereExists(fn ($q) => $q->selectRaw('1')->from('maintenance_requests')
            ->whereColumn('maintenance_requests.id', "{$table}.maintenance_request_id")
            ->whereIn('maintenance_requests.status', array_map(fn (MaintenanceStatus $s) => $s->value, self::BILLABLE_REQUEST_STATUSES)));
    }

    public function maintenanceRequest(): BelongsTo
    {
        return $this->belongsTo(MaintenanceRequest::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'provider_id');
    }

    public function validator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'validated_by_id');
    }

    /** Le reversement au bailleur qui a retenu cette facture en frais. */
    public function imputedPayout(): BelongsTo
    {
        return $this->belongsTo(Payout::class, 'imputed_payout_id');
    }

    /** Les reversements au prestataire qui paient cette facture (un seul vivant à la fois). */
    public function payouts(): HasMany
    {
        return $this->hasMany(Payout::class);
    }
}
