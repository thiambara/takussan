<?php

namespace App\Services\Model;

use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;

class PayoutService
{
    /**
     * @param  array<string,mixed>  $data
     */
    public function create(User $user, User $landlord, array $data): Payout
    {
        abort_code_unless(
            $user->isSuperAdmin() || $user->agency_id,
            403,
            'payout.issuer_forbidden'
        );

        // TCK-528 — le bailleur doit tenir un profil DANS l'agence de l'émetteur. La règle comparait
        // `$landlord->agency_id`, qui vaut `null` pour un bailleur sans agence comme pour un bailleur
        // présent dans plusieurs agences : les deux passaient, vers n'importe quelle agence.
        $agencyId = $user->agency_id;
        abort_code_if(
            $agencyId && ! (
                // TCK-587 — APPARTENANCE du bénéficiaire, sans filtre de statut.
                $landlord->hasProfileAt((int) $agencyId, OwnerProfile::class)
                || $landlord->hasProfileAt((int) $agencyId, AgentProfile::class)
                || $landlord->hasProfileAt((int) $agencyId, AgencyAdminProfile::class)
            ),
            403,
            'payout.landlord_not_in_agency'
        );

        $gross = (float) $data['gross_amount'];
        $commission = isset($data['commission_amount']) ? (float) $data['commission_amount'] : 0;
        $fees = isset($data['fees_amount']) ? (float) $data['fees_amount'] : 0;
        $net = round($gross - $commission - $fees, 2);

        abort_code_if($net < 0, 422, 'payout.net_negative');

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
        abort_code_unless(
            in_array($payout->status, [PayoutStatus::Pending, PayoutStatus::Scheduled, PayoutStatus::Processing], true),
            422,
            'payout.cannot_process'
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
        abort_code_if(
            in_array($payout->status, [PayoutStatus::Completed, PayoutStatus::Cancelled], true),
            422,
            'payout.cannot_fail'
        );

        $reason = isset($data['failed_reason']) ? trim((string) $data['failed_reason']) : '';
        abort_code_if($reason === '', 422, 'payout.failure_reason_required');

        $payout->update([
            'status' => PayoutStatus::Failed,
            'failed_reason' => $reason,
        ]);

        return $payout->refresh();
    }

    public function cancel(Payout $payout): Payout
    {
        abort_code_if(
            in_array($payout->status, [PayoutStatus::Completed, PayoutStatus::Cancelled], true),
            422,
            'payout.cannot_cancel'
        );

        $payout->update(['status' => PayoutStatus::Cancelled]);

        return $payout->refresh();
    }
}
