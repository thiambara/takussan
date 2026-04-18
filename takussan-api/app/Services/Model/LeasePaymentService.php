<?php

namespace App\Services\Model;

use App\Models\Enums\NotificationType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;

class LeasePaymentService
{
    public function __construct(protected NotificationService $notifications) {}
    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Lease $lease, User $user, array $data): LeasePayment
    {
        return $lease->payments()->create(array_merge($data, [
            'reference_number' => ReferenceNumberGenerator::leasePayment(),
            'payer_id' => $lease->tenant_id,
            'collector_id' => $user->id,
            'currency' => $lease->currency?->value ?? 'XOF',
            'status' => PaymentStatus::Pending->value,
        ]));
    }

    /**
     * @param  array<string,mixed>  $data
     */
    public function markPaid(LeasePayment $payment, array $data = []): LeasePayment
    {
        abort_unless(
            in_array($payment->status, [PaymentStatus::Pending, PaymentStatus::Late], true),
            422,
            'Only pending or late payments can be marked paid.'
        );

        $payment->update([
            'status' => PaymentStatus::Paid,
            'paid_at' => $data['paid_at'] ?? now(),
            'payment_method' => $data['payment_method'] ?? $payment->payment_method,
            'transaction_id' => $data['transaction_id'] ?? $payment->transaction_id,
        ]);

        $payment->refresh();

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
