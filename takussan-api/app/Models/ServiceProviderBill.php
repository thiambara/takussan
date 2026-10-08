<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\Currency;
use App\Models\Enums\ServiceProviderBillStatus;
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
 */
class ServiceProviderBill extends AbstractModel
{
    use HasFactory;

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

    protected static array $requestSortable = ['id', 'created_at', 'amount', 'validated_at'];

    protected static array $requestLoadable = ['maintenanceRequest', 'property', 'provider', 'payouts'];

    protected static array $queryFields = [
        'id', 'maintenance_request_id', 'agency_id', 'property_id', 'provider_id',
        'reference_number', 'provider_reference', 'amount', 'currency', 'exceeds_quote', 'status',
        'validated_by_id', 'validated_at', 'rejection_reason', 'rechargeable_to_landlord',
        'imputed_payout_id', 'created_at', 'updated_at',
    ];

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
