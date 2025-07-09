<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Booking extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $table = 'bookings';

    protected $fillable = [
        'property_id',
        'customer_id',
        'user_id',
        'reference_number',
        'status',
        'booking_date',
        'start_date',
        'end_date',
        'expiration_date',
        'approval_date',
        'rejection_date',
        'cancellation_date',
        'completion_date',
        'price_at_booking',
        'total_amount',
        'deposit_amount',
        'deposit_paid',
        'deposit_date',
        'notes',
        'reason_for_rejection',
        'reason_for_cancellation',
        'cancellation_by',
        'metadata'
    ];

    protected $casts = [
        'booking_date' => 'datetime',
        'start_date' => 'datetime',
        'end_date' => 'datetime',
        'expiration_date' => 'datetime',
        'approval_date' => 'datetime',
        'rejection_date' => 'datetime',
        'cancellation_date' => 'datetime',
        'completion_date' => 'datetime',
        'deposit_date' => 'datetime',
        'deposit_paid' => 'boolean',
        'price_at_booking' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
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

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function booking_payments(): HasMany
    {
        return $this->hasMany(BookingPayment::class);
    }
}
