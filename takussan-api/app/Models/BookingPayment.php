<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Concerns\HasPaymentAttributes;
use App\Models\Enums\BookingPaymentType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class BookingPayment extends AbstractModel
{
    use HasFactory, HasPaymentAttributes, SoftDeletes;

    protected $fillable = [
        'booking_id', 'payer_id', 'collector_id',
        'reference_number', 'receipt_number',
        'amount', 'currency', 'payment_method', 'payment_type', 'status',
        'refund_amount', 'refund_reason', 'paid_at', 'transaction_id', 'notes', 'metadata',
    ];

    protected $casts = [
        'payment_type' => BookingPaymentType::class,
        'refund_amount' => 'decimal:2',
        'metadata' => 'array',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function payer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'payer_id');
    }

    public function collector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'collector_id');
    }

    public function payouts(): BelongsToMany
    {
        return $this->belongsToMany(Payout::class, 'payout_booking_payment');
    }
}
