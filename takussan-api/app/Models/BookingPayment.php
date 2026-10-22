<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Concerns\HasPaymentAttributes;
use App\Models\Contracts\HasAuditAgency;
use App\Models\Enums\BookingPaymentType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\Support\LogOptions;

class BookingPayment extends AbstractModel implements HasAuditAgency
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
        'platform_fee_pct_at_payment', 'platform_payout_id',
    ];

    protected $casts = [
        'payment_type' => BookingPaymentType::class,
        'refund_amount' => 'decimal:2',
        'metadata' => 'array',
        'bank_reconciled_at' => 'datetime',
        'platform_fee_pct_at_payment' => 'decimal:2',
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

    /**
     * TCK-1417 (P141.04) — ce qui attend un crédit du relevé de l'agence : le scope que partagent
     * le matcher (`ReconciliationMatcher`) et la recherche manuelle (`PaymentSearchService`).
     *
     * L'agence d'un acompte est celle de la réservation (`bookings.agency_id`), comme pour la
     * clôture de la plateforme et l'audit (`auditAgencyId`) ; un acompte encaissé par la
     * plateforme en est écarté (TCK-1415).
     */
    public function scopeAwaitingBankCredit(Builder $query, int $agencyId): Builder
    {
        return $query->whereNotReconciled()
            ->whereHas('booking', fn (Builder $q) => $q->where('agency_id', $agencyId))
            ->whereNotSettledByPlatform();
    }

    /** TCK-601 (ADR-0044 §3) — l'agence d'une activité sur cette ligne est celle de la réservation. */
    public function auditAgencyId(): ?int
    {
        $agencyId = $this->booking()->value('agency_id');

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
