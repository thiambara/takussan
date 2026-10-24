<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Concerns\HasPaymentAttributes;
use App\Models\Contracts\HasAuditAgency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\Support\LogOptions;

class LeasePayment extends AbstractModel implements HasAuditAgency
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
        'late_fee_amount', 'late_fee_applied_at', 'late_fee_paid_at', 'refund_amount', 'transaction_id', 'notes', 'metadata',
        'marked_paid_at', 'bank_reconciled_at', 'bank_statement_line_id',
        'platform_fee_pct_at_payment', 'platform_payout_id',
    ];

    protected $casts = [
        'payment_type' => LeasePaymentType::class,
        'period_start' => 'date',
        'period_end' => 'date',
        'due_date' => 'date',
        'late_fee_amount' => 'decimal:2',
        'refund_amount' => 'decimal:2',
        'late_fee_applied_at' => 'datetime',
        'late_fee_paid_at' => 'datetime',
        'marked_paid_at' => 'datetime',
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

    /**
     * TCK-1831 (P183.01) — l'échéance est-elle en retard, à la règle de `scopeOverdue` : `late`, ou
     * `pending`/`partially_paid` dont la date d'échéance est AVANT aujourd'hui. L'échéance du jour
     * n'est pas en retard (la première relance part à J+1, `SendLeasePaymentReminders`). Une
     * restitution de caution ne l'est jamais : c'est l'agence qui la doit, pas le locataire
     * (features.md, TCK-595). Servie par `LeasePaymentResource`, pour que le front ne refasse pas
     * la comparaison à l'horloge du navigateur.
     */
    public function isOverdue(): bool
    {
        if ($this->payment_type === LeasePaymentType::DepositRefund) {
            return false;
        }

        if ($this->status === PaymentStatus::Late) {
            return true;
        }

        return in_array($this->status, [PaymentStatus::Pending, PaymentStatus::PartiallyPaid], true)
            && $this->due_date !== null
            && $this->due_date->toDateString() < now()->toDateString();
    }

    /**
     * P140.02 (TCK-1792) — les identités que la quittance imprime (`DocumentPdfController::
     * streamRentReceipt`), lues aux mêmes sources, suppressions douces comprises.
     *
     * @return array<string, Model|null>
     */
    public function printedIdentityRoles(): array
    {
        $lease = Lease::withTrashed()->with([
            'property' => fn ($q) => $q->withTrashed(),
            'property.address',
            'tenant' => fn ($q) => $q->withTrashed(),
            'agency',
        ])->find($this->lease_id);

        return ['tenant' => $lease?->tenant, 'property' => $lease?->property, 'agency' => $lease?->agency];
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
     * TCK-1417 (P141.04) — ce qui attend un crédit du relevé de l'agence : le scope que partagent
     * le matcher (`ReconciliationMatcher`) et la recherche manuelle (`PaymentSearchService`).
     *
     * Sans les cautions rendues (TCK-594) ni les loyers encaissés par la plateforme (TCK-1415).
     */
    public function scopeAwaitingBankCredit(Builder $query, int $agencyId): Builder
    {
        return $query->whereNotReconciled()
            ->whereHas('lease', fn (Builder $q) => $q->where('agency_id', $agencyId))
            ->exceptDepositRefunds()
            ->whereNotSettledByPlatform();
    }

    /** TCK-601 (ADR-0044 §3) — l'agence d'une activité sur cette ligne est celle du bail. */
    public function auditAgencyId(): ?int
    {
        $agencyId = $this->lease()->value('agency_id');

        return $agencyId !== null ? (int) $agencyId : null;
    }

    /**
     * TCK-828 (P25.07) — le montant attendu sur le compte de l'agence, pour CETTE ligne : la même
     * règle que `scopeWhereExpectedAmountNear()`, lue en PHP. Le montant figé ne vaut que pour une
     * échéance soldée en ligne ; sinon, `amount`.
     */
    public function expectedBankAmount(): float
    {
        $settledBy = $this->metadata['gateway']['settled_by'] ?? null;
        if ($settledBy !== null && $settledBy !== PaymentGatewayService::SETTLED_MANUALLY) {
            return (float) ($this->metadata['gateway_expected_amount'] ?? $this->amount);
        }

        return (float) $this->amount;
    }

    /**
     * TCK-715 (P25.01, P25.02) — le montant attendu sur le compte de l'agence, à `$tolerance` près.
     * Une seule expression, partagée par le matcher (`ReconciliationMatcher`) et la recherche
     * manuelle (`PaymentSearchService`).
     *
     * Le montant figé à l'initiation du checkout (`metadata.gateway_expected_amount`, pénalité
     * comprise quand l'agence l'encaisse en ligne, TCK-593) ne se lit que si l'échéance a été
     * soldée EN LIGNE : `metadata.gateway.settled_by` porte alors l'identifiant de la transaction.
     * Un règlement manuel y pose `manual` (`PaymentGatewayService::markManualSettlement`), et le
     * montant figé d'un checkout abandonné ne dit plus rien de l'argent reçu : `amount`, plus la
     * pénalité quand elle a été réglée le même jour que le loyer (TCK-833).
     */
    public function scopeWhereExpectedAmountNear(Builder $query, float $amount, float $tolerance): Builder
    {
        $metadata = $query->qualifyColumn('metadata');
        $settledBy = "({$metadata}->'gateway'->>'settled_by')";
        $rowAmount = $query->qualifyColumn('amount');
        // TCK-833 (P25.06) — hors ligne, une pénalité réglée LE MÊME JOUR que le loyer arrive dans
        // le même virement : elle entre dans le montant attendu. Réglée un autre jour, non.
        $lateFee = $query->qualifyColumn('late_fee_amount');
        $lateFeePaidAt = $query->qualifyColumn('late_fee_paid_at');
        $paidAt = $query->qualifyColumn('paid_at');
        $offline = "{$rowAmount} + CASE WHEN {$lateFeePaidAt} IS NOT NULL AND {$paidAt} IS NOT NULL "
            ."AND {$lateFeePaidAt}::date = {$paidAt}::date THEN COALESCE({$lateFee}, 0) ELSE 0 END";

        return $query->whereRaw(
            "ABS(CASE WHEN {$settledBy} IS NOT NULL AND {$settledBy} <> ? "
            ."THEN COALESCE(({$metadata}->>'gateway_expected_amount')::numeric, {$rowAmount}) "
            ."ELSE {$offline} END - ?) < ?",
            [PaymentGatewayService::SETTLED_MANUALLY, $amount, $tolerance],
        );
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
