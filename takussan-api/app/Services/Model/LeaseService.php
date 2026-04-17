<?php

namespace App\Services\Model;

use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;

class LeaseService
{
    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Property $property, User $user, array $data): Lease
    {
        $canCreate = $user->hasRole(['admin', 'super_admin'])
            || $property->user_id === $user->id
            || ($user->agency_id && $property->agency_id === $user->agency_id);
        abort_unless($canCreate, 403);

        return Lease::create(array_merge($data, [
            'reference_number' => ReferenceNumberGenerator::lease(),
            'landlord_id' => $property->user_id,
            'agency_id' => $property->agency_id ?? $user->agency_id,
            'status' => LeaseStatus::Draft->value,
            'currency' => $data['currency'] ?? 'XOF',
            'payment_frequency' => $data['payment_frequency'] ?? 'monthly',
        ]));
    }

    public function activate(Lease $lease): Lease
    {
        abort_unless(
            $lease->status === LeaseStatus::Draft,
            422,
            'Only draft leases can be activated.'
        );

        $lease->update([
            'status' => LeaseStatus::Active,
            'signed_at' => now(),
        ]);

        return $lease->refresh();
    }

    public function terminate(Lease $lease, User $user, ?string $reason = null): Lease
    {
        abort_unless(
            in_array($lease->status, [LeaseStatus::Active, LeaseStatus::PendingSignature], true),
            422,
            'Only active or pending-signature leases can be terminated.'
        );

        $lease->update([
            'status' => LeaseStatus::Terminated,
            'terminated_at' => now(),
            'terminated_by_id' => $user->id,
            'termination_reason' => $reason,
        ]);

        return $lease->refresh();
    }
}
