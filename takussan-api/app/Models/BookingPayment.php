<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Concerns\HasPaymentAttributes;
use App\Models\Enums\BookingPaymentType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\Support\LogOptions;

class BookingPayment extends AbstractModel
{
    use Auditable, HasFactory, HasPaymentAttributes, SoftDeletes;

    /**
     * Override Auditable to exclude `transaction_id` (third-party provider
     * reference, potentially PII/secret) from the activity log.
     */
    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly([
                'booking_id', 'payer_id', 'collector_id',
                'reference_number', 'receipt_number',
                'amount', 'currency', 'payment_method', 'payment_type', 'status',
                'refund_amount', 'refund_reason', 'paid_at',
            ])
            ->logOnlyDirty()
            ->dontLogIfAttributesChangedOnly(['transaction_id', 'notes', 'metadata', 'updated_at'])
            ->dontLogEmptyChanges()
            ->useLogName(class_basename(static::class));
    }

    protected $fillable = [
        'booking_id', 'payer_id', 'collector_id',
        'reference_number', 'receipt_number',
        'amount', 'currency', 'payment_method', 'payment_type', 'status',
        'refund_amount', 'refund_reason', 'paid_at', 'transaction_id', 'notes', 'metadata',
        'bank_reconciled_at', 'bank_statement_line_id',
    ];

    protected $casts = [
        'payment_type' => BookingPaymentType::class,
        'refund_amount' => 'decimal:2',
        'metadata' => 'array',
        'bank_reconciled_at' => 'datetime',
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

    public function bankStatementLine(): BelongsTo
    {
        return $this->belongsTo(BankStatementLine::class, 'bank_statement_line_id');
    }

    public function scopeWhereNotReconciled(Builder $query): Builder
    {
        return $query->whereNull('bank_reconciled_at');
    }
}
