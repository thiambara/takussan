<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
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
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'property_id', 'customer_id', 'created_by_id', 'agency_id',
        'reference_number', 'status',
        'total_amount', 'deposit_amount', 'currency',
        'start_date', 'end_date', 'notes',
        'confirmed_at', 'cancelled_at', 'expires_at',
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
        'metadata' => 'array',
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
