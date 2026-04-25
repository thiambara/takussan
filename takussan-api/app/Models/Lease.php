<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Lease extends AbstractModel
{
    use Auditable, HasFactory, SoftDeletes;

    protected $fillable = [
        'property_id', 'landlord_id', 'tenant_id', 'agency_id',
        'booking_id', 'renewed_from_lease_id', 'guarantor_id',
        'reference_number', 'type', 'status',
        'start_date', 'end_date', 'renewal_date',
        'monthly_rent', 'sale_price', 'currency',
        'deposit_amount', 'commission_amount', 'commission_rate',
        'payment_frequency', 'payment_day',
        'late_fee_percent', 'late_fee_grace_days',
        'terms', 'special_conditions',
        'signed_at', 'terminated_at', 'termination_reason', 'terminated_by_id', 'metadata',
    ];

    protected $casts = [
        'type' => LeaseType::class,
        'status' => LeaseStatus::class,
        'currency' => Currency::class,
        'payment_frequency' => PaymentFrequency::class,
        'monthly_rent' => 'decimal:2',
        'sale_price' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'commission_amount' => 'decimal:2',
        'commission_rate' => 'decimal:2',
        'late_fee_percent' => 'decimal:2',
        'late_fee_grace_days' => 'integer',
        'start_date' => 'date',
        'end_date' => 'date',
        'renewal_date' => 'date',
        'signed_at' => 'datetime',
        'terminated_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['property_id', 'landlord_id', 'tenant_id', 'agency_id', 'type', 'status', 'currency', 'payment_frequency'];

    protected static array $requestSortable = ['id', 'created_at', 'start_date', 'end_date', 'monthly_rent'];

    protected static array $requestLoadable = ['property', 'landlord', 'tenant', 'agency', 'guarantor'];

    protected static array $requestCountable = ['payments', 'maintenanceRequests', 'documents'];

    protected static array $requestRangeFilters = ['monthly_rent'];

    protected static array $queryFields = [
        'id', 'property_id', 'landlord_id', 'tenant_id', 'agency_id',
        'reference_number', 'type', 'status',
        'start_date', 'end_date', 'monthly_rent', 'currency', 'deposit_amount',
        'payment_frequency', 'late_fee_percent', 'late_fee_grace_days',
        'signed_at', 'terminated_at', 'created_at', 'updated_at',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function landlord(): BelongsTo
    {
        return $this->belongsTo(User::class, 'landlord_id');
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'tenant_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function renewedFrom(): BelongsTo
    {
        return $this->belongsTo(self::class, 'renewed_from_lease_id');
    }

    public function guarantor(): BelongsTo
    {
        return $this->belongsTo(Guarantor::class);
    }

    /**
     * Many-to-many guarantors (up to 3 per lease, enforced at API layer).
     * The legacy `guarantor_id` FK is kept for backward compatibility
     * until all consumers migrate to this relation.
     */
    public function guarantors(): BelongsToMany
    {
        return $this->belongsToMany(Guarantor::class, 'lease_guarantor')
            ->withPivot(['role'])
            ->withTimestamps();
    }

    public function terminatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'terminated_by_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(LeasePayment::class);
    }

    public function inventories(): HasMany
    {
        return $this->hasMany(Inventory::class);
    }

    public function maintenanceRequests(): HasMany
    {
        return $this->hasMany(MaintenanceRequest::class);
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }
}
