<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Services\Invitation\AgentInvitationService;
use App\Services\Invitation\OwnerInvitationService;
use App\Services\Invitation\ServiceProviderInvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * TCK-819 (P22.03) — les trois services d'invitation jugent l'inviteur par LA policy, et non par
 * une copie de sa règle.
 *
 * Les deux copies avaient déjà divergé (la policy refusait d'abord par `AgencyKindGuard`, le
 * service non) ; aujourd'hui elles rendent la même réponse, donc aucun appel HTTP ne les
 * distingue. Le test fixe la décision de la policy par `Gate::before`, et vérifie que le service
 * la suit dans les deux sens : un refus de la policy refuse un admin d'agence, un accord de la
 * policy laisse passer un compte sans profil. Une copie locale ignore les deux.
 */
class InvitationServicesFollowPolicyTest extends TestCase
{
    use RefreshDatabase;

    private function standardAgency(): Agency
    {
        return Agency::factory()->create(['kind' => AgencyKind::Standard]);
    }

    /** Fixe la décision de `$ability` sur `$subject` (classe ou instance), et seulement elle. */
    private function policyDecides(string $ability, string $subjectClass, bool $decision): void
    {
        Gate::before(function (User $user, string $asked, array $arguments) use ($ability, $subjectClass, $decision): ?bool {
            $subject = $arguments[0] ?? null;
            $matches = $subject === $subjectClass || $subject instanceof $subjectClass;

            return $asked === $ability && $matches ? $decision : null;
        });
    }

    private function assertForbidden(callable $call): void
    {
        try {
            $call();
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());

            return;
        }

        $this->fail('403 attendu : la policy refuse, le service a laissé passer.');
    }

    // ── Refus de la policy : un admin d'agence est refusé ─────────────────────

    public function test_agent_invitation_refused_when_the_policy_refuses(): void
    {
        Mail::fake();
        $agency = $this->standardAgency();
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $this->policyDecides('invite', AgentProfile::class, false);

        $this->assertForbidden(fn () => app(AgentInvitationService::class)->invite($agency, $admin, [
            'email' => 'a@example.com', 'role' => 'agent', 'first_name' => 'A', 'last_name' => 'B',
        ]));
    }

    public function test_agent_suspension_and_removal_refused_when_the_policy_refuses(): void
    {
        $agency = $this->standardAgency();
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $profile = AgentProfile::factory()->create(['agency_id' => $agency->id, 'user_id' => null, 'status' => AgentProfileStatus::Draft]);
        $this->policyDecides('suspend', AgentProfile::class, false);
        $this->policyDecides('delete', AgentProfile::class, false);

        $service = app(AgentInvitationService::class);
        $this->assertForbidden(fn () => $service->suspend($profile, $admin));
        $this->assertForbidden(fn () => $service->remove($profile, $admin));
        $this->assertModelExists($profile);
    }

    public function test_owner_invitation_refused_when_the_policy_refuses(): void
    {
        Mail::fake();
        $agency = $this->standardAgency();
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $this->policyDecides('invite', OwnerProfile::class, false);

        $this->assertForbidden(fn () => app(OwnerInvitationService::class)->invite($agency, $admin, [
            'email' => 'o@example.com', 'first_name' => 'A', 'last_name' => 'B', 'owner_type' => 'individual',
        ]));
    }

    public function test_service_provider_invitation_refused_when_the_policy_refuses(): void
    {
        Mail::fake();
        $agency = $this->standardAgency();
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $this->policyDecides('invite', ServiceProviderProfile::class, false);

        $this->assertForbidden(fn () => app(ServiceProviderInvitationService::class)->invite($agency, $admin, [
            'email' => 'sp@example.com', 'first_name' => 'A', 'last_name' => 'B',
        ]));
    }

    // ── Accord de la policy : un compte sans profil passe ─────────────────────

    public function test_the_three_invitations_pass_when_the_policy_grants(): void
    {
        Mail::fake();
        $agency = $this->standardAgency();
        $stranger = User::factory()->create();
        $this->policyDecides('invite', AgentProfile::class, true);
        $this->policyDecides('invite', OwnerProfile::class, true);
        $this->policyDecides('invite', ServiceProviderProfile::class, true);

        app(AgentInvitationService::class)->invite($agency, $stranger, [
            'email' => 'a@example.com', 'role' => 'agent', 'first_name' => 'A', 'last_name' => 'B',
        ]);
        app(OwnerInvitationService::class)->invite($agency, $stranger, [
            'email' => 'o@example.com', 'first_name' => 'A', 'last_name' => 'B', 'owner_type' => 'individual',
        ]);
        app(ServiceProviderInvitationService::class)->invite($agency, $stranger, [
            'email' => 'sp@example.com', 'first_name' => 'A', 'last_name' => 'B',
        ]);

        $this->assertDatabaseCount('invitations', 3);
    }

    public function test_agent_suspension_passes_when_the_policy_grants(): void
    {
        $agency = $this->standardAgency();
        $stranger = User::factory()->create();
        $profile = AgentProfile::factory()->create(['agency_id' => $agency->id, 'user_id' => null, 'status' => AgentProfileStatus::Draft]);
        $this->policyDecides('suspend', AgentProfile::class, true);

        $suspended = app(AgentInvitationService::class)->suspend($profile, $stranger);

        $this->assertSame(AgentProfileStatus::Suspended, $suspended->status);
    }

    // ── Le kind de l'agence reste jugé par le service, avant la policy ────────

    public function test_individual_agency_still_refused_even_when_the_policy_grants(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $stranger = User::factory()->create();
        $this->policyDecides('invite', AgentProfile::class, true);

        $this->assertForbidden(fn () => app(AgentInvitationService::class)->invite($agency, $stranger, [
            'email' => 'a@example.com', 'role' => 'agent', 'first_name' => 'A', 'last_name' => 'B',
        ]));
    }
}
