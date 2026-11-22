<?php

namespace Tests\Feature\Agency;

use App\Jobs\Permissions\ProcessRoleDelegationsJob;
use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Permissions\RoleDelegationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Vérification de TCK-2668 (D3) — le remplaçant qui « peut agir » à la place d'un admin absent
 * emprunte ses capacités, SAUF `team.delegate_role` : une délégation ne se redélègue pas (ADR-0035).
 *
 * Mesuré sur 776dc214f : le remplaçant recevait `team.delegate_role` dans `/me/capabilities` (le
 * résolveur comptait la délégation), quand `RoleDelegationPolicy` juge la détention propre ; l'écran
 * lui offrait « Déclarer », « Modifier » et « Terminer l'absence », et l'API rendait 403 à chacun.
 */
class RemplacantNeRedeleguePasTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $absent;

    private User $substitute;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-11-09 09:00:00', 'Africa/Dakar'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->member('agency_admin');
        $this->absent = $this->member('agency_admin');
        $this->substitute = $this->member('agent');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function member(string $role): User
    {
        $user = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->materializeRoleProfile($user, $role, $this->agency);

        return $user;
    }

    private function couvrirLAbsentEtOuvrirLaPeriode(): void
    {
        $this->actingAsApi($this->admin)->apiPost("/api/agencies/{$this->agency->id}/absences", [
            'user_id' => $this->absent->id,
            'substitute_id' => $this->substitute->id,
            'starts_at' => '2026-11-10T00:00:00+00:00',
            'ends_at' => '2026-11-14',
            'substitute_can_act' => true,
        ])->assertCreated();

        $this->travelTo(Carbon::parse('2026-11-12 10:00:00', 'Africa/Dakar'));
        (new ProcessRoleDelegationsJob)->handle(app(RoleDelegationService::class));
    }

    private function peut(Capability $capability): bool
    {
        return app(MembershipCapabilityResolver::class)->allows($this->substitute->fresh(), $capability, $this->agency->fresh());
    }

    public function test_le_remplacant_emprunte_les_capacites_de_l_admin_sauf_celle_de_deleguer(): void
    {
        $this->assertFalse($this->peut(Capability::TeamInvite), 'précondition : un agent n\'invite pas');

        $this->couvrirLAbsentEtOuvrirLaPeriode();

        $this->assertTrue($this->peut(Capability::TeamInvite), 'la délégation prête bien le rôle d\'admin');
        $this->assertFalse($this->peut(Capability::TeamDelegateRole));
        $this->assertNotContains(
            Capability::TeamDelegateRole,
            app(MembershipCapabilityResolver::class)->filterAllowed($this->substitute->fresh(), Capability::cases(), $this->agency->fresh()),
        );
    }

    public function test_me_capabilities_ne_lui_offre_pas_team_delegate_role_et_l_api_refuse_toujours(): void
    {
        $this->couvrirLAbsentEtOuvrirLaPeriode();

        $capacites = $this->actingAsApi($this->substitute->fresh())
            ->getJson("/api/me/capabilities?agency_id={$this->agency->id}")
            ->assertOk()->json('data.capabilities');

        $this->assertContains(Capability::TeamInvite->value, $capacites);
        $this->assertNotContains(Capability::TeamDelegateRole->value, $capacites);
        $this->actingAsApi($this->substitute->fresh())
            ->getJson("/api/agencies/{$this->agency->id}/role-delegations")
            ->assertForbidden();
    }
}
