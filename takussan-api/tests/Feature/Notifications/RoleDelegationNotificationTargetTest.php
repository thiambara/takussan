<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationTarget;
use App\Events\Permissions\RoleDelegationActivated;
use App\Events\Permissions\RoleDelegationExpired;
use App\Events\Permissions\RoleDelegationRevoked;
use App\Listeners\Permissions\NotifyDelegationActivated;
use App\Listeners\Permissions\NotifyDelegationExpired;
use App\Listeners\Permissions\NotifyDelegationRevoked;
use App\Models\AppNotification;
use App\Models\RoleDelegation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1471 (P161.03) — les avis de délégation du DÉLÉGANT mènent à `/app/agency/roles`, où vivent
 * les délégations (`RoleDelegationsSection`, TCK-369) : `/app/agency/team` ne les montre pas.
 * La cible du bénéficiaire n'est pas tranchée (reste au porteur) : elle ne change pas ici.
 */
class RoleDelegationNotificationTargetTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{class-string, class-string, string}> */
    public static function gestes(): array
    {
        return [
            'activation' => [NotifyDelegationActivated::class, RoleDelegationActivated::class, 'role_delegation.activated'],
            'révocation' => [NotifyDelegationRevoked::class, RoleDelegationRevoked::class, 'role_delegation.revoked'],
            'expiration' => [NotifyDelegationExpired::class, RoleDelegationExpired::class, 'role_delegation.expired'],
        ];
    }

    #[DataProvider('gestes')]
    public function test_le_delegant_est_mene_aux_delegations(string $listener, string $event, string $code): void
    {
        $delegation = RoleDelegation::factory()->create(['role' => 'agency_admin']);

        app($listener)->handle(new $event($delegation));

        $chemin = fn (int $userId): ?string => NotificationTarget::forRow(
            AppNotification::query()->where('user_id', $userId)->sole(),
        )?->path();

        $delegant = AppNotification::query()->where('user_id', $delegation->delegator_id)->sole();
        $this->assertSame("{$code}_delegator", $delegant->code);
        $this->assertSame('/app/agency/roles', $chemin($delegation->delegator_id));
        // Le bénéficiaire garde sa cible d'aujourd'hui : sa cible est laissée au porteur.
        $this->assertSame('/app/agency/team', $chemin($delegation->user_id));
    }
}
