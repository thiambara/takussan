<?php

namespace App\Listeners\Permissions;

use App\Events\Permissions\RoleDelegationExpired;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\RoleDelegation;
use App\Services\Model\NotificationService;

class NotifyDelegationExpired
{
    public function __construct(
        private readonly NotificationService $notificationService,
    ) {}

    public function handle(RoleDelegationExpired $event): void
    {
        $delegation = $event->delegation;
        $user = $delegation->user;
        $delegator = $delegation->delegator;
        $role = $delegation->role;

        // Notify beneficiary
        $this->notificationService->notify(
            user: $user,
            type: NotificationType::RoleDelegationExpired,
            title: __('role_delegations.notifications.expired.title', ['role' => $role]),
            body: __('role_delegations.notifications.expired.body_beneficiary', ['role' => $role]),
            data: [
                'role' => $role,
                'agency_id' => $delegation->agency_id,
                'is_critical' => false,
            ],
            channel: NotificationChannel::App,
            referenceableType: RoleDelegation::class,
            referenceableId: $delegation->id,
        );

        // Notify delegator
        $this->notificationService->notify(
            user: $delegator,
            type: NotificationType::RoleDelegationExpired,
            title: __('role_delegations.notifications.expired.title', ['role' => $role]),
            body: __('role_delegations.notifications.expired.body_delegator', [
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
