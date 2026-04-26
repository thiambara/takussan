<?php

namespace App\Services\Property;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use App\Notifications\PropertyApprovedNotification;
use App\Notifications\PropertyRejectedNotification;
use Illuminate\Support\Facades\DB;

class PropertyModerationService
{
    /**
     * Approve a property: transition to `active`, record approver + timestamp,
     * emit an activity log entry, notify the property owner.
     */
    public function approve(Property $property, User $admin): Property
    {
        abort_unless(
            $property->status === PropertyStatus::PendingReview,
            422,
            'Le bien n\'est pas en attente de modération.'
        );

        DB::transaction(function () use ($property, $admin) {
            $property->update([
                'status' => PropertyStatus::Available,
                'approved_at' => now(),
                'approved_by_user_id' => $admin->id,
                'rejected_at' => null,
                'rejected_by_user_id' => null,
                'rejection_reason' => null,
            ]);

            activity('Property')
                ->performedOn($property)
                ->causedBy($admin)
                ->withProperties(['old_status' => 'pending_review', 'new_status' => 'available'])
                ->event('property.approved')
                ->log('Bien approuvé');
        });

        $owner = $property->owner;
        if ($owner) {
            $owner->notify(new PropertyApprovedNotification($property));
        }

        return $property->refresh();
    }

    /**
     * Reject a property: transition to `rejected`, record rejecter + reason +
     * timestamp, emit an activity log entry, notify the property owner.
     */
    public function reject(Property $property, User $admin, string $rejectionReason): Property
    {
        abort_unless(
            $property->status === PropertyStatus::PendingReview,
            422,
            'Le bien n\'est pas en attente de modération.'
        );

        DB::transaction(function () use ($property, $admin, $rejectionReason) {
            $property->update([
                'status' => PropertyStatus::Rejected,
                'rejected_at' => now(),
                'rejected_by_user_id' => $admin->id,
                'rejection_reason' => $rejectionReason,
                'approved_at' => null,
                'approved_by_user_id' => null,
            ]);

            activity('Property')
                ->performedOn($property)
                ->causedBy($admin)
                ->withProperties([
                    'old_status' => 'pending_review',
                    'new_status' => 'rejected',
                    'rejection_reason' => $rejectionReason,
                ])
                ->event('property.rejected')
                ->log('Bien refusé');
        });

        $owner = $property->owner;
        if ($owner) {
            $owner->notify(new PropertyRejectedNotification($property, $rejectionReason));
        }

        return $property->refresh();
    }

    /**
     * Resubmit a rejected property for review: transition back to `pending_review`,
     * clear rejection fields, reset submitted_at, emit an activity log entry.
     */
    public function resubmit(Property $property, User $actor): Property
    {
        abort_unless(
            $property->status === PropertyStatus::Rejected,
            422,
            'Seul un bien refusé peut être resoumis.'
        );

        DB::transaction(function () use ($property, $actor) {
            $property->update([
                'status' => PropertyStatus::PendingReview,
                'submitted_at' => now(),
                'rejection_reason' => null,
                'rejected_at' => null,
                'rejected_by_user_id' => null,
            ]);

            activity('Property')
                ->performedOn($property)
                ->causedBy($actor)
                ->withProperties(['old_status' => 'rejected', 'new_status' => 'pending_review'])
                ->event('property.resubmitted')
                ->log('Bien resoumis pour modération');
        });

        return $property->refresh();
    }
}
