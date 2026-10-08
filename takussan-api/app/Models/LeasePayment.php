<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Concerns\HasPaymentAttributes;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
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
                'late_fee_amount', 'late_fee_applied_at', 'late_fee_paid_at',
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
        'late_fee_amount', 'late_fee_applied_at', 'late_fee_paid_at', 'transaction_id', 'notes', 'metadata',
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
        'late_fee_paid_at' => 'datetime',
        'metadata' => 'array',
        'bank_reconciled_at' => 'datetime',
        'platform_fee_pct_at_payment' => 'decimal:2',
    ];

    /**
     * TCK-593 — la pénalité de retard restant due.
     *
     * `status` décrit le LOYER, jamais la pénalité : un loyer soldé (`paid`) dont la pénalité n'est
     * pas réglée garde ici le montant de la pénalité. Rien d'autre ne le dit.
     */
    public function lateFeeOutstanding(): float
    {
        // VERIF-596 passe 6 (m-h) — une échéance annulée par un renouvellement ne doit plus rien,
        // pénalité comprise : l'enfant refacture le mois.
        if ($this->status === PaymentStatus::Cancelled) {
            return 0.0;
        }

        $fee = (float) ($this->late_fee_amount ?? 0);

        return $fee > 0 && $this->late_fee_paid_at === null ? round($fee, 2) : 0.0;
    }

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

    /**
     * TCK-594 (VERIF-594 passe 4, P4-5 et P4-7) — sans les lignes `deposit_refund` : une caution rendue
     * est une SORTIE vers le locataire, ni un encaissement, ni une échéance qu'il doit.
     */
    public function scopeExceptDepositRefunds(Builder $query): Builder
    {
        return $query->where($query->qualifyColumn('payment_type'), '!=', LeasePaymentType::DepositRefund->value);
    }
}
