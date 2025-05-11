<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class BookingPayment extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $table = 'payments';

    protected $fillable = [
        'booking_id',
        'user_id',
        'amount',
        'payment_method',
        'payment_type',
        'transaction_id',
        'status',
        'payment_date',
        'confirmed_date',
        'receipt_number',
        'notes',
        'metadata'
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payment_date' => 'datetime',
        'confirmed_date' => 'datetime',
        'metadata' => 'array',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
