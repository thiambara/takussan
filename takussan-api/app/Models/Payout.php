<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PayoutStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payout extends AbstractModel
{
    use Auditable, HasFactory, SoftDeletes;

    protected $fillable = [
        'lease_id', 'booking_id', 'agency_id', 'landlord_id', 'issued_by_id',
        'reference_number', 'status',
        'period_start', 'period_end',
        'gross_amount', 'commission_amount', 'fees_amount', 'net_amount',
        'currency', 'payment_method', 'transaction_id',
        'scheduled_at', 'processed_at', 'failed_reason', 'notes', 'metadata',
    ];

    protected $casts = [
        'status' => PayoutStatus::class,
        'currency' => Currency::class,
        'payment_method' => PaymentMethod::class,
        'period_start' => 'date',
        'period_end' => 'date',
        'gross_amount' => 'decimal:2',
        'commission_amount' => 'decimal:2',
        'fees_amount' => 'decimal:2',
        'net_amount' => 'decimal:2',
        'scheduled_at' => 'datetime',
        'processed_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['lease_id', 'booking_id', 'agency_id', 'landlord_id', 'issued_by_id', 'status', 'currency', 'payment_method'];

    protected static array $requestSortable = ['id', 'created_at', 'period_start', 'period_end', 'net_amount', 'scheduled_at', 'processed_at'];

    protected static array $requestLoadable = ['lease', 'booking', 'agency', 'landlord'];

    protected static array $requestRangeFilters = ['net_amount', 'gross_amount'];

    protected static array $queryFields = [
        'id', 'lease_id', 'booking_id', 'agency_id', 'landlord_id',
        'reference_number', 'status', 'period_start', 'period_end',
        'gross_amount', 'commission_amount', 'net_amount', 'currency',
        'payment_method', 'scheduled_at', 'processed_at', 'created_at', 'updated_at',
    ];

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function landlord(): BelongsTo
    {
        return $this->belongsTo(User::class, 'landlord_id');
    }

    public function issuer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'issued_by_id');
    }

    public function leasePayments(): BelongsToMany
    {
        return $this->belongsToMany(LeasePayment::class, 'payout_lease_payment');
    }

    public function bookingPayments(): BelongsToMany
    {
        return $this->belongsToMany(BookingPayment::class, 'payout_booking_payment');
    }
}
