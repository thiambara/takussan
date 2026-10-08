<?php

namespace App\Services\Model;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Payments\PaymentGatewayService;

class LeasePaymentService
{
    public function __construct(protected NotificationService $notifications) {}

    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Lease $lease, User $user, array $data): LeasePayment
    {
        // Preserve caller-provided status when explicit; default to pending.
        $status = $data['status'] ?? PaymentStatus::Pending->value;

        return $lease->payments()->create(array_merge($data, [
            'reference_number' => ReferenceNumberGenerator::leasePayment(),
            'payer_id' => $lease->tenant_id,
            'collector_id' => $user->id,
            'currency' => $lease->currency?->value ?? 'XOF',
            'status' => $status instanceof PaymentStatus ? $status->value : $status,
        ]));
    }

    /**
     * @param  array<string,mixed>  $data
     */
    public function markPaid(LeasePayment $payment, array $data = [], ?User $by = null): LeasePayment
    {
        // TCK-594 (VERIF-594 passe 4, P4-7) — la ligne d'une caution rendue se règle par son
        // reversement (`PayoutService::markProcessed`), jamais à la main : marquée payée, le refus de
        // la restitution la laissait `paid`, et la restitution suivante en créait une seconde.
        abort_code_if(
            $payment->payment_type === LeasePaymentType::DepositRefund,
            422,
            'lease_payment.deposit_refund_paid_by_payout'
        );

        abort_code_unless(
            in_array($payment->status, [PaymentStatus::Pending, PaymentStatus::Late], true),
            422,
            'lease_payment.cannot_mark_paid'
        );

        // TCK-593 (vérification adverse, V3) — un règlement manuel pendant qu'un checkout est
        // ouvert ferait encaisser l'échéance deux fois : refusé tant que le checkout vit.
        $gateway = app(PaymentGatewayService::class);
        // Passe 2, M5 — le personnel peut passer outre, motif à l'appui (la requête en réserve le
        // droit au personnel de l'agence) : le checkout écarté, payé quand même, sera un doublon
        // signalé (V3).
        $overridden = null;
        if (! empty($data['override_open_checkout'])) {
            $overridden = $gateway->supersedeOpenCheckout($payment, (string) ($data['override_reason'] ?? ''));
        } else {
            $gateway->assertNoOpenCheckout($payment);
        }
        $gateway->markManualSettlement($payment);

        $payment->update([
            'status' => PaymentStatus::Paid,
            'paid_at' => $data['paid_at'] ?? now(),
            'payment_method' => $data['payment_method'] ?? $payment->payment_method,
            'transaction_id' => $data['transaction_id'] ?? $payment->transaction_id,
        ]);

        $payment->refresh();

        if ($overridden !== null) {
            $gateway->logCheckoutOverride($payment, $by, $overridden, 'mark_paid');
        }

        // Notify tenant and landlord — TCK-588 : le reçu du bailleur nomme le bien et le locataire.
        $lease = $payment->lease;
        if ($lease) {
            $lease->loadMissing(['property', 'tenant.user', 'landlord']);
            $tenantUser = $lease->tenant?->user;
            $landlord = $lease->landlord;
            $amount = NotificationRenderer::money($payment->amount, $payment->currency);
            $target = NotificationTarget::of('lease', $lease->id);

            if ($tenantUser) {
                $this->notifications->send($tenantUser, NotificationCode::LeasePaymentRecorded, [
                    'amount' => $amount,
                    'property' => $lease->property?->title,
                ], $target);
            }
            if ($landlord) {
                $this->notifications->send($landlord, NotificationCode::LeasePaymentReceivedLandlord, [
                    'amount' => $amount,
                    'property' => $lease->property?->title,
                    'tenant' => trim(($lease->tenant?->first_name ?? '').' '.($lease->tenant?->last_name ?? '')),
                ], $target);
            }
        }

        return $payment;
    }
}
