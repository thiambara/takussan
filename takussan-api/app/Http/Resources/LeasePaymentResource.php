<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Payments\DuplicatePayments;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Http\Request;

class LeasePaymentResource extends BaseResource
{
    /**
     * TCK-2958 (ADR-0128 § 4) — le lecteur dont la ressource dit les gestes (`abilities`) : posé par
     * l'échéancier du bail (`LeasePaymentController::index`) et par la carte du fil.
     */
    private ?User $lecteurDesGestes = null;

    public function avecGestes(?User $lecteur): static
    {
        $this->lecteurDesGestes = $lecteur;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $gateway = app(PaymentGatewayService::class);
        $du = (float) ($gateway->amountDue($this->resource) ?? 0);

        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'lease_id' => $this->lease_id,
            'payer_id' => $this->payer_id,
            'collector_id' => $this->collector_id,
            // TCK-1182 (P100.03) — `whenHas` : sous un sparse fieldset qui ne lit pas la colonne, la clé
            // est omise au lieu d'une valeur inventée (montant à 0, nature ou devise par défaut).
            'amount' => $this->whenHas('amount', fn () => (float) $this->amount),
            'currency' => $this->currency?->value,
            'payment_method' => $this->payment_method?->value,
            'payment_type' => $this->payment_type?->value,
            'period_start' => $this->calendarDate($this->period_start),
            'period_end' => $this->calendarDate($this->period_end),
            'due_date' => $this->calendarDate($this->due_date),
            'paid_at' => $this->iso($this->paid_at),
            'status' => $this->status?->value,
            // `paid_amount` et `remaining_amount` se dérivent d'`amount` (`HasPaymentAttributes`).
            'paid_amount' => $this->whenHas('amount', fn () => (float) $this->paid_amount),
            'remaining_amount' => $this->whenHas('amount', fn () => (float) $this->remaining_amount),
            // TCK-1135 (P76.06) — le montant rendu, tel qu'en base, sous la forme de `BookingPaymentResource`.
            'refund_amount' => $this->refund_amount !== null ? (float) $this->refund_amount : null,
            'late_fee_amount' => $this->late_fee_amount !== null ? (float) $this->late_fee_amount : null,
            'late_fee_applied_at' => $this->iso($this->late_fee_applied_at),
            // TCK-593 — ce que doit le locataire, calculé UNE fois (`PaymentGatewayService::amountDue`) :
            // le front affiche ces montants et n'additionne rien.
            'late_fee_paid_at' => $this->iso($this->late_fee_paid_at),
            // P206.04 (ADR-0039, amendement du 2026-10-24, point 7) — la part de pénalité rendue : une
            // pénalité rendue en entier est remise, ni acquittée ni due.
            'late_fee_refund_amount' => $this->late_fee_refund_amount !== null ? (float) $this->late_fee_refund_amount : null,
            'late_fee_outstanding' => $this->resource->lateFeeOutstanding(),
            'late_fee_payable_online' => $gateway->lateFeeIncluded($this->resource),
            'amount_due' => $du,
            // TCK-2778 — les verdicts des deux gestes sur la pénalité de retard SEULE, restée due sur
            // un loyer payé : la relance notée (`subject: late_fee`), et le lien qui ne fait payer
            // qu'elle — seulement si l'agence encaisse ses pénalités en ligne. Le front ne refait
            // pas la règle.
            'late_fee_reminder_allowed' => $this->resource->lateFeeAloneOutstanding(),
            'late_fee_link_allowed' => $gateway->lateFeeAloneCollectibleOnline($this->resource),
            // TCK-594 (P5-3) — une caution rendue n'a pas de quittance de loyer.
            'receipt_available' => $this->status === PaymentStatus::Paid && $this->payment_type !== LeasePaymentType::DepositRefund,
            // TCK-1831 (P183.01) — le retard, jugé UNE fois ici à la règle de `scopeOverdue` : le front
            // l'affiche et ne compare plus `due_date` à l'horloge du navigateur.
            'is_overdue' => $this->resource->isOverdue(),
            // TCK-608 — un encaissement en double (part pénalité comprise) reste à rendre au locataire :
            // le personnel le constate par « Doublon remboursé ».
            'duplicate_refund_pending' => DuplicatePayments::anyRefundPending($this->metadata),
            'notes' => $this->notes,
            'created_at' => $this->iso($this->created_at),
            // TCK-2958 — les gestes de CE lecteur, jugés comme leurs routes les jugent.
            'abilities' => $this->when($this->lecteurDesGestes !== null && $this->resource instanceof LeasePayment, fn (): array => $this->gestes($this->lecteurDesGestes, $du)),
        ];
    }

    /**
     * TCK-2958 — payer : le compte du locataire du bail (la carte le lui offre), que
     * `POST /api/payments/{paymentType}/{paymentId}/initiate` juge par `LeasePaymentPolicy::update`,
     * tant qu'un reste est dû ; relancer : `LeasePaymentPolicy::remind` ; encaisser : la porte de
     * `POST lease-payments/{payment}/mark-paid`, `LeasePolicy::recordPayment` sur le bail.
     *
     * @return array{pay: bool, remind: bool, record_payment: bool}
     */
    private function gestes(User $lecteur, float $du): array
    {
        $payment = $this->resource;
        $lease = $payment->lease;
        $ouvert = $du > 0 && $payment->status !== PaymentStatus::Paid;
        $locataire = $lease?->tenant?->user_id !== null && (int) $lease->tenant->user_id === (int) $lecteur->id;

        return [
            'pay' => $ouvert && $locataire && $lecteur->can('update', $payment),
            'remind' => $ouvert && $lecteur->can('remind', $payment),
            'record_payment' => $ouvert && $lease !== null && $lecteur->can('recordPayment', $lease),
        ];
    }
}
