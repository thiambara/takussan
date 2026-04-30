<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CancellationBy;
use App\Models\Enums\Currency;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Booking extends AbstractModel
{
    use Auditable, HasFactory, SoftDeletes;

    protected $fillable = [
        'property_id', 'customer_id', 'created_by_id', 'agency_id',
        'reference_number', 'status',
        'total_amount', 'deposit_amount', 'currency',
        'start_date', 'end_date', 'notes',
        'confirmed_at', 'cancelled_at', 'expires_at', 'expired_at', 'expiry_reason',
        'cancellation_by', 'cancellation_reason', 'metadata',
    ];

    protected $casts = [
        'status' => BookingStatus::class,
        'currency' => Currency::class,
        'cancellation_by' => CancellationBy::class,
        'total_amount' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'start_date' => 'date',
        'end_date' => 'date',
        'confirmed_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'expires_at' => 'datetime',
        'expired_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['property_id', 'customer_id', 'created_by_id', 'agency_id', 'status', 'currency'];

    protected static array $requestSortable = ['id', 'created_at', 'start_date', 'end_date', 'status'];

    protected static array $requestLoadable = ['property', 'customer', 'agency'];

    protected static array $requestCountable = ['payments'];

    protected static array $requestRangeFilters = ['total_amount'];

    protected static array $queryFields = [
        'id', 'property_id', 'customer_id', 'created_by_id', 'agency_id',
        'reference_number', 'status', 'total_amount', 'deposit_amount', 'currency',
        'start_date', 'end_date', 'confirmed_at', 'cancelled_at', 'created_at', 'updated_at',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(BookingPayment::class);
    }

    public function lease(): HasOne
    {
        return $this->hasOne(Lease::class);
    }
}
