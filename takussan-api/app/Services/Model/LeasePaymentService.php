<?php

namespace App\Services\Model;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Notifications\NotificationRenderer;

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
    public function markPaid(LeasePayment $payment, array $data = []): LeasePayment
    {
        abort_code_unless(
            in_array($payment->status, [PaymentStatus::Pending, PaymentStatus::Late], true),
            422,
            'lease_payment.cannot_mark_paid'
        );

        $payment->update([
            'status' => PaymentStatus::Paid,
            'paid_at' => $data['paid_at'] ?? now(),
            'payment_method' => $data['payment_method'] ?? $payment->payment_method,
            'transaction_id' => $data['transaction_id'] ?? $payment->transaction_id,
        ]);

        $payment->refresh();

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
