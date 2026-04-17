<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Concerns\HasPaymentAttributes;
use App\Models\Enums\LeasePaymentType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class LeasePayment extends AbstractModel
{
    use HasFactory, HasPaymentAttributes, SoftDeletes;

    protected $fillable = [
        'lease_id', 'payer_id', 'collector_id',
        'reference_number', 'amount', 'currency',
        'payment_method', 'payment_type',
        'period_start', 'period_end', 'due_date', 'paid_at', 'status',
        'late_fee', 'transaction_id', 'notes', 'metadata',
    ];

    protected $casts = [
        'payment_type' => LeasePaymentType::class,
        'period_start' => 'date',
        'period_end' => 'date',
        'due_date' => 'date',
        'late_fee' => 'decimal:2',
        'metadata' => 'array',
    ];

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
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
        return $this->belongsToMany(Payout::class, 'payout_lease_payment');
    }
}
