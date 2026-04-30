<?php

namespace App\Listeners\Permissions;

use App\Events\Permissions\RoleDelegationActivated;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\RoleDelegation;
use App\Services\Model\NotificationService;

class NotifyDelegationActivated
{
    public function __construct(
        private readonly NotificationService $notificationService,
    ) {}

    public function handle(RoleDelegationActivated $event): void
    {
        $delegation = $event->delegation;
        $user = $delegation->user;
        $delegator = $delegation->delegator;
        $role = $delegation->role;
        $endsAt = $delegation->ends_at->format('d/m/Y');

        // Notify beneficiary
        $this->notificationService->notify(
            user: $user,
            type: NotificationType::RoleDelegated,
            title: __('role_delegations.notifications.activated.title', ['role' => $role]),
            body: __('role_delegations.notifications.activated.body_beneficiary', [
                'role' => $role,
                'ends_at' => $endsAt,
            ]),
            data: [
                'role' => $role,
                'agency_id' => $delegation->agency_id,
                'ends_at' => $delegation->ends_at->toIso8601String(),
                'is_critical' => false,
            ],
            channel: NotificationChannel::App,
            referenceableType: RoleDelegation::class,
            referenceableId: $delegation->id,
        );

        // Notify delegator (confirmation)
        $this->notificationService->notify(
            user: $delegator,
            type: NotificationType::RoleDelegated,
            title: __('role_delegations.notifications.activated.title', ['role' => $role]),
            body: __('role_delegations.notifications.activated.body_delegator', [
                'beneficiary' => $user->first_name.' '.$user->last_name,
                'role' => $role,
            ]),
            data: [
                'role' => $role,
                'agency_id' => $delegation->agency_id,
                'beneficiary_id' => $user->id,
                'is_critical' => false,
            ],
            channel: NotificationChannel::App,
            referenceableType: RoleDelegation::class,
            referenceableId: $delegation->id,
        );
    }
}
