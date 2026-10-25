<?php

namespace Tests\Feature\Api\Permissions;

use App\Events\Permissions\RoleDelegationActivated;
use App\Events\Permissions\RoleDelegationExpired;
use App\Events\Permissions\RoleDelegationRevoked;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * P211.06 (TCK-2111) — `activate`, `expire` et `revoke` jugent le statut sur la ligne relue sous
 * verrou. Ils le jugeaient sur le modèle reçu : la tâche planifiée, qui charge ses délégations
 * avant de les traiter, réactivait une délégation qu'un admin venait de révoquer, et prévenait le
 * délégataire de son activation.
 *
 * La course se rejoue sans concurrence : le geste reçoit un modèle chargé avant la révocation.
 */
class RoleDelegationSousVerrouTest extends TestCase
{
    use RefreshDatabase;

    /** @param  array<string, mixed>  $attributes */
    private function delegation(RoleDelegationStatus $status, array $attributes = []): RoleDelegation
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $delegant = User::factory()->create();
        $this->materializeRoleProfile($delegant, 'agency_admin', $agency);

        return RoleDelegation::create(array_merge([
            'user_id' => User::factory()->create()->id,
            'delegator_id' => $delegant->id,
            'agency_id' => $agency->id,
            'role' => 'agency_admin',
            'status' => $status,
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addDay(),
            'user_native_roles_snapshot' => [],
        ], $attributes));
    }

    public function test_une_delegation_revoquee_derriere_le_modele_charge_par_la_tache_ne_s_active_pas(): void
    {
        $delegation = $this->delegation(RoleDelegationStatus::Scheduled);
        $chargee = RoleDelegation::readyToActivate()->whereKey($delegation->id)->firstOrFail();
        $service = app(RoleDelegationService::class);
        Event::fake([RoleDelegationActivated::class, RoleDelegationRevoked::class]);

        $service->revoke(RoleDelegation::query()->findOrFail($delegation->id), User::factory()->create());
        $service->activate($chargee);

        $ligne = $delegation->refresh();
        $this->assertSame(RoleDelegationStatus::Revoked, $ligne->status);
        $this->assertNull($ligne->activated_at);
        Event::assertNotDispatched(RoleDelegationActivated::class);
    }

    public function test_une_delegation_revoquee_derriere_le_modele_charge_par_la_tache_n_expire_pas(): void
    {
        $delegation = $this->delegation(RoleDelegationStatus::Active, ['ends_at' => now()->subMinute()]);
        $chargee = RoleDelegation::readyToExpire()->whereKey($delegation->id)->firstOrFail();
        $service = app(RoleDelegationService::class);
        Event::fake([RoleDelegationExpired::class, RoleDelegationRevoked::class]);

        $service->revoke(RoleDelegation::query()->findOrFail($delegation->id), User::factory()->create());
        $service->expire($chargee);

        $ligne = $delegation->refresh();
        $this->assertSame(RoleDelegationStatus::Revoked, $ligne->status);
        $this->assertNull($ligne->expired_at);
        Event::assertNotDispatched(RoleDelegationExpired::class);
    }

    public function test_une_seconde_revocation_sur_un_modele_perime_ne_fait_rien(): void
    {
        $delegation = $this->delegation(RoleDelegationStatus::Active);
        $perimee = RoleDelegation::query()->findOrFail($delegation->id);
        $premier = User::factory()->create();
        $service = app(RoleDelegationService::class);
        Event::fake([RoleDelegationRevoked::class]);

        $service->revoke($delegation, $premier);
        $service->revoke($perimee, User::factory()->create());

        $this->assertSame($premier->id, $delegation->refresh()->revoked_by);
        Event::assertDispatchedTimes(RoleDelegationRevoked::class, 1);
    }

    public function test_une_delegation_programmee_s_active_toujours(): void
    {
        $delegation = $this->delegation(RoleDelegationStatus::Scheduled);
        Event::fake([RoleDelegationActivated::class]);

        app(RoleDelegationService::class)->activate($delegation);

        $this->assertSame(RoleDelegationStatus::Active, $delegation->refresh()->status);
        Event::assertDispatchedTimes(RoleDelegationActivated::class, 1);
    }
}
