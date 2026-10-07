<?php

namespace App\Services\Model;

use App\Models\Enums\NotificationType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
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
        abort_unless(
            in_array($payment->status, [PaymentStatus::Pending, PaymentStatus::Late], true),
            422,
            'Only pending or late payments can be marked paid.'
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

        // Notify tenant and landlord
        $lease = $payment->lease;
        if ($lease) {
            $tenantUser = $lease->tenant?->user;
            $landlord = $lease->landlord;

            if ($tenantUser) {
                $this->notifications->notify(
                    $tenantUser,
                    NotificationType::Payment,
                    'Paiement enregistré',
                    'Votre paiement de '.$payment->amount.' '.$payment->currency?->value.' a été enregistré.',
                    ['lease_payment_id' => $payment->id],
                );
            }
            if ($landlord) {
                $this->notifications->notify(
                    $landlord,
                    NotificationType::Payment,
                    'Paiement reçu',
                    'Un paiement de '.$payment->amount.' '.$payment->currency?->value.' a été enregistré.',
                    ['lease_payment_id' => $payment->id],
                );
            }
        }

        return $payment;
    }
}
