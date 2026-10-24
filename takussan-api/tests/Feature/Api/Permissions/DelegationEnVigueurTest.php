<?php

namespace Tests\Feature\Api\Permissions;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Lead\ContactLeadService;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Membership\TeamMemberSuspensionService;
use App\Services\Payout\PayoutApprovers;
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-2202 (P218.01, P218.02 ; ADR-0031, amendement du 2026-10-24, § A) — une délégation ne confère
 * rien à un délégué sans profil d'agence actif dans l'agence de la délégation.
 *
 * Avant : la suspension laissait la délégation `active`, et tous ses lecteurs la comptaient sans
 * regarder les profils du délégué. L'agent suspendu délégué `agency_admin` restait personnel
 * (`isStaffAt`), invitait (`team.invite` → 201), approuvait un reversement et recevait les
 * demandes de contact. La réactivation rend la délégation sans geste de plus.
 */
class DelegationEnVigueurTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        // `primary_admin_id` nul : ce court-circuit épargnerait son porteur de toute capacité.
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard, 'primary_admin_id' => null]);

        $this->admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::AgencyAdmin)
            ->withCapabilities([Capability::TeamDelegateRole, Capability::TeamInvite, Capability::PayoutsApprove, Capability::CrmViewAll])
            ->create(['agency_id' => $this->agency->id]);
        AgencyAdminProfile::query()->create([
            'user_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $role->id,
        ]);
        $this->admin = $this->admin->fresh();

        // Un agent dont aucun profil ne porte de capacité : tout ce qu'il peut vient de la délégation.
        $this->agent = User::factory()->create(['agency_id' => $this->agency->id]);
        AgentProfile::query()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agency->id]);
        $vide = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)->withCapabilities([])
            ->create(['agency_id' => $this->agency->id]);
        foreach ([AgentProfile::class, OwnerProfile::class] as $classe) {
            $classe::query()->where('user_id', $this->agent->id)->where('agency_id', $this->agency->id)
                ->update(['agency_role_id' => $vide->id]);
        }
        $this->agent = $this->agent->fresh();
    }

    private function deleguer(string $role = 'agency_admin'): RoleDelegation
    {
        return RoleDelegation::query()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => $role,
            'starts_at' => null,
            'ends_at' => now()->addWeek(),
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
            'user_native_roles_snapshot' => [],
        ]);
    }

    private function suspendre(): void
    {
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);
        $this->agent = $this->agent->fresh();
    }

    private function inviter(string $email): TestResponse
    {
        return $this->actingAs($this->agent->fresh())
            ->postJson("/api/agencies/{$this->agency->id}/agents/invite", [
                'email' => $email,
                'role' => 'agent',
                'first_name' => 'Awa',
                'last_name' => 'Ndiaye',
            ]);
    }

    private function resolver(): MembershipCapabilityResolver
    {
        return app(MembershipCapabilityResolver::class);
    }

    public function test_le_delegue_suspendu_n_est_plus_personnel_et_n_invite_plus(): void
    {
        $delegation = $this->deleguer();
        $this->suspendre();

        $this->assertSame(RoleDelegationStatus::Active, $delegation->fresh()->status, 'la suspension ne touche pas la délégation');
        $this->assertFalse($this->resolver()->allows($this->agent, Capability::TeamInvite, $this->agency));
        $this->assertFalse($this->resolver()->isStaffAt($this->agent, (int) $this->agency->id));
        $this->assertNotContains((int) $this->agency->id, $this->resolver()->staffAgencyIds($this->agent));
        $this->assertFalse(MembershipCapabilityResolver::primed(
            [$this->agent->id],
            [$this->agency->id],
            fn () => $this->resolver()->isStaffAt($this->agent, (int) $this->agency->id),
        ));
        $this->inviter('suspendu@exemple.sn')->assertForbidden();
    }

    public function test_la_reactivation_rend_la_delegation_sans_geste_de_plus(): void
    {
        $this->deleguer();
        $this->suspendre();
        app(TeamMemberSuspensionService::class)->reactivate($this->agency, $this->agent, $this->admin);
        $this->agent = $this->agent->fresh();

        $this->assertTrue($this->resolver()->isStaffAt($this->agent, (int) $this->agency->id));
        $this->assertTrue(MembershipCapabilityResolver::primed(
            [$this->agent->id],
            [$this->agency->id],
            fn () => $this->resolver()->isStaffAt($this->agent, (int) $this->agency->id),
        ));
        $this->inviter('reactive@exemple.sn')->assertCreated();
    }

    public function test_le_delegue_suspendu_n_approuve_plus_et_ne_recoit_plus_les_demandes(): void
    {
        $this->deleguer();
        // Témoin : actif, le délégué approuve et lit les demandes de l'agence.
        $this->assertContains($this->agent->id, app(PayoutApprovers::class)->holders($this->agency)->pluck('id')->all());
        $this->assertContains($this->agent->id, app(ContactLeadService::class)->agencyReaders((int) $this->agency->id)->pluck('id')->all());

        $this->suspendre();

        $this->assertNotContains($this->agent->id, app(PayoutApprovers::class)->holders($this->agency)->pluck('id')->all());
        $this->assertNotContains($this->agent->id, app(ContactLeadService::class)->agencyReaders((int) $this->agency->id)->pluck('id')->all());
    }

    /** P218.02 — la création vers un délégué suspendu reste permise, et la délégation reste inerte. */
    public function test_une_delegation_creee_vers_un_suspendu_reste_inerte(): void
    {
        $this->suspendre();

        $delegation = app(RoleDelegationService::class)->create($this->agency, $this->admin, [
            'user_id' => $this->agent->id,
            'role' => 'agent',
            'starts_at' => null,
            'ends_at' => now()->addWeek()->toIso8601String(),
        ]);

        $this->assertSame(RoleDelegationStatus::Active, $delegation->fresh()->status);
        $this->assertFalse($this->resolver()->isStaffAt($this->agent->fresh(), (int) $this->agency->id));
    }
}
