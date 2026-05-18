<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Concerns\HasPaymentAttributes;
use App\Models\Enums\LeasePaymentType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\Support\LogOptions;

class LeasePayment extends AbstractModel
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
                'lease_id', 'payer_id', 'collector_id',
                'reference_number', 'amount', 'currency',
                'payment_method', 'payment_type',
                'period_start', 'period_end', 'due_date', 'paid_at', 'status',
                'late_fee_amount', 'late_fee_applied_at',
            ])
            ->logOnlyDirty()
            ->dontLogIfAttributesChangedOnly(['transaction_id', 'notes', 'metadata', 'updated_at'])
            ->dontLogEmptyChanges()
            ->useLogName(class_basename(static::class));
    }

    protected $fillable = [
        'lease_id', 'payer_id', 'collector_id',
        'reference_number', 'amount', 'currency',
        'payment_method', 'payment_type',
        'period_start', 'period_end', 'due_date', 'paid_at', 'status',
        'late_fee_amount', 'late_fee_applied_at', 'transaction_id', 'notes', 'metadata',
        'bank_reconciled_at', 'bank_statement_line_id',
        'platform_fee_pct_at_payment', 'platform_payout_id',
    ];

    protected $casts = [
        'payment_type' => LeasePaymentType::class,
        'period_start' => 'date',
        'period_end' => 'date',
        'due_date' => 'date',
        'late_fee_amount' => 'decimal:2',
        'late_fee_applied_at' => 'datetime',
        'metadata' => 'array',
        'bank_reconciled_at' => 'datetime',
        'platform_fee_pct_at_payment' => 'decimal:2',
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

    public function bankStatementLine(): BelongsTo
    {
        return $this->belongsTo(BankStatementLine::class, 'bank_statement_line_id');
    }

    public function scopeWhereNotReconciled(Builder $query): Builder
    {
        return $query->whereNull('bank_reconciled_at');
    }
}
