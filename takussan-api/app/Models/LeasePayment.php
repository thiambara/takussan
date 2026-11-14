<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Concerns\HasPaymentAttributes;
use App\Models\Contracts\HasAuditAgency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Pdf\PrintedIdentity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
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
        'late_fee_bank_reconciled_at', 'late_fee_bank_statement_line_id',
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
        // P206.01 (ADR-0039, amendement du 2026-10-24, point 6) — le reversement qui a pris la
        // pénalité réglée, et sa copie figée. Écrits par `PayoutService` seul, jamais par le client.
        'late_fee_payout_amount' => 'decimal:2',
        'late_fee_payout_commission_rate' => 'decimal:2',
        'late_fee_payout_commission_amount' => 'decimal:2',
        // P206.04 (ADR-0039, amendement du 2026-10-24, point 7) — la part de pénalité rendue.
        'late_fee_refund_amount' => 'decimal:2',
        'marked_paid_at' => 'datetime',
        'metadata' => 'array',
        'bank_reconciled_at' => 'datetime',
        // TCK-2793 (ADR-0039, amendement du 2026-11-14, point 5) — le rapprochement de la pénalité
        // payée seule, à côté de celui du loyer. Écrit par `ReconciliationManager` seul.
        'late_fee_bank_reconciled_at' => 'datetime',
        'platform_fee_pct_at_payment' => 'decimal:2',
    ];

    /** TCK-2793 — la part d'une échéance qu'une ligne de relevé désigne : la pénalité payée seule. */
    public const PART_LATE_FEE = 'late_fee';

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
        // TCK-2504 (revue) — une échéance remboursée non plus : elle n'est plus due (aucun paiement
        // ne s'y ouvre), et le lien de paiement qui la montre n'annonce pas une pénalité à régler.
        // TCK-2504 (contre-vérification) — ni une restitution de caution : c'est l'agence qui la
        // doit (TCK-594). Le miroir SQL `CollectedPayments::lateFeesOutstanding()` l'excluait seul ;
        // les deux rendent désormais la même règle (`PenalitesARecouvrerTest`, statut par statut).
        if (in_array($this->status, [PaymentStatus::Cancelled, PaymentStatus::Refunded], true)
            || $this->payment_type === LeasePaymentType::DepositRefund) {
            return 0.0;
        }

        $fee = (float) ($this->late_fee_amount ?? 0);

        return $fee > 0 && $this->late_fee_paid_at === null ? round($fee, 2) : 0.0;
    }

    /**
     * TCK-2778 — la pénalité de retard est-elle SEULE due : le loyer est soldé (`paid`) et la
     * pénalité reste à régler (`lateFeeOutstanding() > 0`). C'est l'unique cas où un lien de
     * paiement fait payer la pénalité sans le loyer, et où une relance notée porte `late_fee`. Une
     * échéance encore due relève du loyer (pénalité comprise) ; une échéance payée sans pénalité
     * due n'a rien à relancer.
     */
    public function lateFeeAloneOutstanding(): bool
    {
        return $this->status === PaymentStatus::Paid && $this->lateFeeOutstanding() > 0;
    }

    /**
     * TCK-2793 (ADR-0039, amendement du 2026-11-14, point 1) — le règlement EN LIGNE de la pénalité
     * payée seule (TCK-2778) : l'entrée `subject: late_fee` de `gateway.transactions` que désigne
     * `gateway.late_fee_settled_by`, jamais `late_fee_checkout` (un checkout écarté puis payé quand
     * même n'en est plus le dernier). `null` quand la pénalité n'a pas été réglée par un tel checkout
     * (réglée avec le loyer, à l'agence, ou pas du tout).
     *
     * @return array{transaction_id: string, integration_id: int|null, amount: float}|null
     */
    public function lateFeeAloneSettlement(): ?array
    {
        $gateway = is_array($this->metadata['gateway'] ?? null) ? $this->metadata['gateway'] : [];
        $settledBy = $gateway['late_fee_settled_by'] ?? null;
        if (! is_string($settledBy) || $settledBy === '') {
            return null;
        }

        foreach (is_array($gateway['transactions'] ?? null) ? $gateway['transactions'] : [] as $entry) {
            if (is_array($entry) && ($entry['transaction_id'] ?? null) === $settledBy
                && ($entry['subject'] ?? null) === self::PART_LATE_FEE) {
                return [
                    'transaction_id' => $settledBy,
                    'integration_id' => is_numeric($entry['integration_id'] ?? null) ? (int) $entry['integration_id'] : null,
                    'amount' => is_numeric($entry['amount'] ?? null) ? (float) $entry['amount'] : (float) ($this->late_fee_amount ?? 0),
                ];
            }
        }

        return null;
    }

    /**
     * TCK-2793 — un fragment SQL qui lit le champ `$field` de l'entrée de la pénalité payée seule
     * (celle de `gateway.late_fee_settled_by`, `subject: late_fee`) ; `NULL` sans elle. La forme
     * SQL de {@see self::lateFeeAloneSettlement()}.
     */
    public static function lateFeeAloneEntrySql(string $metadataColumn, string $field): string
    {
        if (preg_match('/^[a-z_]+$/', $field) !== 1) {
            throw new \InvalidArgumentException("Champ d'entrée invalide : {$field}");
        }
        $gateway = "({$metadataColumn}->'gateway')";
        $entries = "jsonb_array_elements(CASE WHEN jsonb_typeof({$gateway}->'transactions') = 'array' "
            ."THEN {$gateway}->'transactions' ELSE '[]'::jsonb END) WITH ORDINALITY AS late_fee_entry(v, n)";
        $value = $field === 'amount'
            ? "CASE WHEN jsonb_typeof(late_fee_entry.v->'amount') = 'number' THEN (late_fee_entry.v->>'amount')::numeric END"
            : "late_fee_entry.v->>'{$field}'";

        return "(SELECT {$value} FROM {$entries} "
            ."WHERE jsonb_typeof({$gateway}->'late_fee_settled_by') = 'string' "
            ."AND late_fee_entry.v->>'transaction_id' = {$gateway}->>'late_fee_settled_by' "
            ."AND late_fee_entry.v->>'subject' = '".self::PART_LATE_FEE."' ORDER BY late_fee_entry.n LIMIT 1)";
    }

    /**
     * TCK-2793 (ADR-0039, amendement du 2026-11-14, point 5) — les pénalités payées seules qui
     * attendent un crédit du relevé de l'agence : réglées par un checkout de la pénalité seule
     * qu'une intégration DE L'AGENCE a initié (celle de la plateforme verse la pénalité fondue dans
     * le net de son `PlatformPayout`), pas encore rapprochées. Le pendant de
     * {@see self::scopeAwaitingBankCredit()} pour la seconde part de l'échéance.
     */
    public function scopeLateFeeAwaitingBankCredit(Builder $query, int $agencyId): Builder
    {
        $integrationId = self::lateFeeAloneEntrySql($query->qualifyColumn('metadata'), 'integration_id');
        $integrations = (new Integration)->getTable();

        return $query->whereNull($query->qualifyColumn('late_fee_bank_reconciled_at'))
            ->whereNotNull($query->qualifyColumn('late_fee_paid_at'))
            ->whereHas('lease', fn (Builder $q) => $q->where('agency_id', $agencyId))
            ->exceptDepositRefunds()
            ->whereRaw("({$integrationId}) IS NOT NULL")
            ->whereRaw("NOT EXISTS (SELECT 1 FROM {$integrations} AS late_fee_integration "
                ."WHERE late_fee_integration.agency_id IS NULL AND late_fee_integration.id::text = ({$integrationId}))");
    }

    /** TCK-2793 — la pénalité payée seule dont le montant figé vaut `$amount`, à `$tolerance` près. */
    public function scopeWhereLateFeeAloneAmountNear(Builder $query, float $amount, float $tolerance): Builder
    {
        $entryAmount = self::lateFeeAloneEntrySql($query->qualifyColumn('metadata'), 'amount');

        return $query->whereRaw("ABS(({$entryAmount}) - ?) < ?", [$amount, $tolerance]);
    }

    /**
     * TCK-2793 — le montant attendu sur le compte de l'agence pour la pénalité payée seule : le
     * montant figé de son checkout ; `0` sans elle.
     */
    public function expectedLateFeeBankAmount(): float
    {
        return $this->lateFeeAloneSettlement()['amount'] ?? 0.0;
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

    /**
     * TCK-2718 — la quittance de loyer fige aussi le téléphone du locataire, qu'elle imprime à
     * défaut de nom et d'e-mail ({@see PrintedIdentity::RENT_RECEIPT_FIELDS}).
     *
     * @return array<string, list<string>>
     */
    public function printedIdentityExtraFields(): array
    {
        return PrintedIdentity::RENT_RECEIPT_FIELDS;
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

    /** TCK-2658 (ADR-0105) — les relances notées à la main ; les rappels automatiques restent dans `metadata`. */
    public function reminders(): HasMany
    {
        return $this->hasMany(LeasePaymentReminder::class);
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
     * échéance soldée en ligne ; sinon, `amount`, plus la pénalité réglée le même jour que le loyer
     * (TCK-833 : le même virement).
     *
     * Contre-vérification de f05a8d1a5 (r1) — cette seconde moitié manquait ici : le SQL l'ajoutait,
     * le PHP non. L'écart consigné à la confirmation (`amount_gap`) accusait une bonne correspondance
     * de 25 000, et le « Chercher » du reste à rapprocher, qui lit ce montant, ne trouvait pas la ligne.
     */
    public function expectedBankAmount(): float
    {
        $settledBy = $this->metadata['gateway']['settled_by'] ?? null;
        if ($settledBy !== null && $settledBy !== PaymentGatewayService::SETTLED_MANUALLY) {
            return (float) ($this->metadata['gateway_expected_amount'] ?? $this->amount);
        }

        // TCK-2793 (ADR-0039, amendement du 2026-11-14, point 5) — une pénalité payée en ligne SEULE
        // arrive par son propre versement, rapproché à part : elle n'entre plus dans celui du loyer,
        // même réglée le même jour.
        $memeJour = $this->late_fee_paid_at !== null && $this->paid_at !== null
            && ($this->metadata['gateway']['late_fee_settled_by'] ?? null) === null
            && $this->late_fee_paid_at->toDateString() === $this->paid_at->toDateString();

        return (float) $this->amount + ($memeJour ? (float) ($this->late_fee_amount ?? 0) : 0.0);
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
        // TCK-2721 (contre-vérification) — le montant figé se lit comme `expectedBankAmount()` le lit
        // en PHP : absent ou `null` → `amount`, sinon le `(float)` de PHP, par le fragment partagé avec
        // `paid_amount`. Un `::numeric` nu levait sur une valeur non numérique écrite hors du modèle,
        // et la recherche de rapprochement comme le matcher tombaient en 500.
        $expected = CollectedPayments::metadataNumberSql($metadata, 'gateway_expected_amount');
        // TCK-2793 — sauf une pénalité payée en ligne seule : son versement est rapproché à part.
        $offline = "{$rowAmount} + CASE WHEN {$lateFeePaidAt} IS NOT NULL AND {$paidAt} IS NOT NULL "
            ."AND ({$metadata}->'gateway'->>'late_fee_settled_by') IS NULL "
            ."AND {$lateFeePaidAt}::date = {$paidAt}::date THEN COALESCE({$lateFee}, 0) ELSE 0 END";

        return $query->whereRaw(
            "ABS(CASE WHEN {$settledBy} IS NOT NULL AND {$settledBy} <> ? "
            ."THEN CASE WHEN COALESCE(jsonb_typeof({$metadata}->'gateway_expected_amount'), 'null') = 'null' "
            ."THEN {$rowAmount} ELSE {$expected} END "
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

    /**
     * TCK-2375 (P04.10) — les mouvements de caution réellement passés : les lignes `deposit` et
     * `deposit_refund` PAYÉES. Une seule définition, que lisent les cautions détenues des rapports
     * (`PortfolioMetrics::depositsHeld`, `AgingBalanceService::depositsHeld`) et la caution encaissée
     * qui borne la restitution (`Lease::collectedDeposit`).
     */
    public function scopePaidDepositMovements(Builder $query): Builder
    {
        return $query
            ->where($query->qualifyColumn('status'), PaymentStatus::Paid->value)
            ->whereIn($query->qualifyColumn('payment_type'), [LeasePaymentType::Deposit->value, LeasePaymentType::DepositRefund->value]);
    }
}
