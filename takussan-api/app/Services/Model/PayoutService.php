<?php

namespace App\Services\Model;

use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\User;

class PayoutService
{
    /**
     * @param  array<string,mixed>  $data
     */
    public function create(User $user, User $landlord, array $data): Payout
    {
        abort_unless(
            $user->isSuperAdmin() || $user->agency_id,
            403,
            'Only agency members or admins can issue payouts.'
        );

        abort_if(
            $user->agency_id && $landlord->agency_id && $landlord->agency_id !== $user->agency_id,
            403,
            'Landlord does not belong to your agency.'
        );

        $gross = (float) $data['gross_amount'];
        $commission = isset($data['commission_amount']) ? (float) $data['commission_amount'] : 0;
        $fees = isset($data['fees_amount']) ? (float) $data['fees_amount'] : 0;
        $net = round($gross - $commission - $fees, 2);

        abort_if($net < 0, 422, 'Net amount cannot be negative.');

        return Payout::create([
            'landlord_id' => $landlord->id,
            'lease_id' => $data['lease_id'] ?? null,
            'booking_id' => $data['booking_id'] ?? null,
            'agency_id' => $user->agency_id,
            'issued_by_id' => $user->id,
            'reference_number' => ReferenceNumberGenerator::payout(),
            'status' => isset($data['scheduled_at']) ? PayoutStatus::Scheduled->value : PayoutStatus::Pending->value,
            'period_start' => $data['period_start'] ?? null,
            'period_end' => $data['period_end'] ?? null,
            'gross_amount' => $gross,
            'commission_amount' => $commission,
            'fees_amount' => $fees ?: null,
            'net_amount' => $net,
            'currency' => $data['currency'] ?? 'XOF',
            'payment_method' => $data['payment_method'] ?? null,
            'scheduled_at' => $data['scheduled_at'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);
    }

    /**
     * @param  array<string,mixed>  $data
     */
    public function markProcessed(Payout $payout, array $data = []): Payout
    {
        abort_unless(
            in_array($payout->status, [PayoutStatus::Pending, PayoutStatus::Scheduled, PayoutStatus::Processing], true),
            422,
            'Payout cannot be marked processed in its current state.'
        );

        $payout->update([
            'status' => PayoutStatus::Completed,
            'processed_at' => $data['processed_at'] ?? now(),
            'transaction_id' => $data['transaction_id'] ?? $payout->transaction_id,
            'payment_method' => $data['payment_method'] ?? $payout->payment_method,
        ]);

        return $payout->refresh();
    }

    /**
     * @param  array<string,mixed>  $data
     */
    public function markFailed(Payout $payout, array $data): Payout
    {
        abort_if(
            in_array($payout->status, [PayoutStatus::Completed, PayoutStatus::Cancelled], true),
            422,
            'Payout cannot be marked failed in its current state.'
        );

        $reason = isset($data['failed_reason']) ? trim((string) $data['failed_reason']) : '';
        abort_if($reason === '', 422, 'A failure reason is required when marking a payout as failed.');

        $payout->update([
            'status' => PayoutStatus::Failed,
            'failed_reason' => $reason,
        ]);

        return $payout->refresh();
    }

    public function cancel(Payout $payout): Payout
    {
        abort_if(
            in_array($payout->status, [PayoutStatus::Completed, PayoutStatus::Cancelled], true),
            422,
            'Payout cannot be cancelled in its current state.'
        );

        $payout->update(['status' => PayoutStatus::Cancelled]);

        return $payout->refresh();
    }
}
