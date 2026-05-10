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
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class Lease extends AbstractModel implements HasMedia
{
    use Auditable, HasFactory, InteractsWithMedia, SoftDeletes;

    protected $fillable = [
        'property_id', 'landlord_id', 'tenant_id', 'agency_id',
        'booking_id', 'renewed_from_lease_id', 'guarantor_id',
        'reference_number', 'type', 'status',
        'start_date', 'end_date', 'renewal_date',
        'monthly_rent', 'sale_price', 'currency',
        'deposit_amount', 'deposit_refunded_amount', 'deposit_refunded_at', 'deposit_refund_reason',
        'commission_amount', 'commission_rate',
        'payment_frequency', 'payment_day',
        'late_fee_percent', 'late_fee_grace_days',
        'terms', 'special_conditions',
        'signed_at', 'terminated_at', 'termination_reason', 'terminated_by_id', 'metadata',
        // TCK-265 — set by SendTenantWelcomeNotification once the welcome
        // email + in-app notification have been sent for this lease.
        'tenant_welcomed_at',
        // TCK-090 — early-termination workflow.
        'early_termination_requested_at', 'early_termination_requested_by',
        'early_termination_effective_date', 'early_termination_penalty_amount',
        'early_termination_reason', 'notice_period_days', 'early_termination_invoice_id',
    ];

    protected $casts = [
        'type' => LeaseType::class,
        'status' => LeaseStatus::class,
        'currency' => Currency::class,
        'payment_frequency' => PaymentFrequency::class,
        'monthly_rent' => 'decimal:2',
        'sale_price' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'deposit_refunded_amount' => 'decimal:2',
        'deposit_refunded_at' => 'datetime',
        'commission_amount' => 'decimal:2',
        'commission_rate' => 'decimal:2',
        'late_fee_percent' => 'decimal:2',
        'late_fee_grace_days' => 'integer',
        'start_date' => 'date',
        'end_date' => 'date',
        'renewal_date' => 'date',
        'signed_at' => 'datetime',
        'tenant_welcomed_at' => 'datetime',
        'terminated_at' => 'datetime',
        // TCK-090
        'early_termination_requested_at' => 'datetime',
        'early_termination_effective_date' => 'date',
        'early_termination_penalty_amount' => 'decimal:2',
        'notice_period_days' => 'integer',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['property_id', 'landlord_id', 'tenant_id', 'agency_id', 'type', 'status', 'currency', 'payment_frequency', 'renewed_from_lease_id'];

    protected static array $requestSortable = ['id', 'created_at', 'start_date', 'end_date', 'monthly_rent'];

    protected static array $requestLoadable = ['property', 'landlord', 'tenant', 'agency', 'guarantor', 'renewedFrom', 'renewals'];

    protected static array $requestCountable = ['payments', 'maintenanceRequests', 'documents', 'renewals'];

    protected static array $requestRangeFilters = ['monthly_rent'];

    protected static array $queryFields = [
        'id', 'property_id', 'landlord_id', 'tenant_id', 'agency_id',
        'booking_id', 'guarantor_id', 'renewed_from_lease_id',
        'reference_number', 'type', 'status',
        'start_date', 'end_date', 'renewal_date',
        'monthly_rent', 'sale_price', 'currency',
        'deposit_amount', 'deposit_refunded_amount', 'deposit_refunded_at', 'deposit_refund_reason',
        'commission_amount', 'commission_rate',
        'payment_frequency', 'payment_day',
        'late_fee_percent', 'late_fee_grace_days',
        'terms', 'special_conditions',
        'signed_at', 'terminated_at', 'termination_reason',
        'created_at', 'updated_at',
        // TCK-090 — exposed so the frontend banner can read the workflow
        // state without a second round-trip (effective_date countdown,
        // penalty amount, invoice link).
        'early_termination_requested_at', 'early_termination_requested_by',
        'early_termination_effective_date', 'early_termination_penalty_amount',
        'early_termination_reason', 'notice_period_days', 'early_termination_invoice_id',
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

    public function renewals(): HasMany
    {
        return $this->hasMany(self::class, 'renewed_from_lease_id');
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

    public function earlyTerminationRequestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'early_termination_requested_by');
    }

    public function earlyTerminationInvoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'early_termination_invoice_id');
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

    public function payouts(): HasMany
    {
        return $this->hasMany(Payout::class);
    }

    public function invoices(): MorphMany
    {
        return $this->morphMany(Invoice::class, 'invoiceable');
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('lease_deposit_refund');
    }

    /**
     * Caution restant à rembourser (deposit_amount − deposit_refunded_amount),
     * borné à 0. Lecture seule.
     */
    public function getDepositRemainingAttribute(): float
    {
        $total = (float) ($this->deposit_amount ?? 0);
        $refunded = (float) ($this->deposit_refunded_amount ?? 0);

        return max(round($total - $refunded, 2), 0.0);
    }
}
