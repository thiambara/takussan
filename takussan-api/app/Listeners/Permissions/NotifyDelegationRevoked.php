<?php

namespace App\Listeners\Permissions;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Permissions\RoleDelegationRevoked;
use App\Services\Model\NotificationService;

/**
 * TCK-588 (ADR-0032) — le bénéficiaire et le délégant reçoivent chacun le code de leur côté,
 * rendu dans LEUR langue : `__()` rendait les deux dans la langue du processus, c'est-à-dire
 * de l'acteur.
 */
class NotifyDelegationRevoked
{
    public function __construct(
        private readonly NotificationService $notificationService,
    ) {}

    public function handle(RoleDelegationRevoked $event): void
    {
        $delegation = $event->delegation;
        $user = $delegation->user;
        $delegator = $delegation->delegator;
        $role = $delegation->role;
        $target = NotificationTarget::of('team');

        // Notify beneficiary
        $this->notificationService->send($user, NotificationCode::RoleDelegationRevoked, ['role' => $role], $target);

        // Notify delegator (confirmation)
        if ($delegator) {
            $this->notificationService->send($delegator, NotificationCode::RoleDelegationRevokedDelegator, [
                'role' => $role,
                'beneficiary' => trim(($user->first_name ?? '').' '.($user->last_name ?? '')),
            ], $target);
        }
    }
}
