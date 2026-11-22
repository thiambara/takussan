<?php

namespace Tests\Feature\Calendar;

use App\Models\Agency;
use App\Models\CalendarFeed;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use App\Services\Admin\UserSupportService;
use App\Services\Calendar\CalendarFeedService;
use App\Services\Invitation\AgentInvitationService;
use App\Services\Membership\TeamMemberSuspensionService;
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Password;
use Tests\ApiTestCase;

/**
 * TCK-617 AC2 (ADR-0034, amendement du 2026-11-16) — chaque geste de révocation coupe aussi les
 * liens d'agenda du compte, PAR ÉCRITURE (`revoked_at` posé, copie chiffrée effacée).
 *
 * ⚠ Pour les gestes qui font aussi sortir du personnel (blocage, suspension, fin de délégation…),
 * `CalendarFeedService::resolve()` rend déjà 404 à la lecture : le 404 seul ne prouverait rien. Ces
 * cas affirment la ligne écrite, et que le lien reste mort une fois le titulaire redevenu personnel.
 * Seuls la réinitialisation du mot de passe et la révocation d'une session sont jugées par le 404 :
 * le titulaire y reste personnel actif, et le lien était servi avant ce ticket. Le départ d'un
 * bailleur et la cooptation retirée passent par le même point commun (`revokeAll`), sans test de lien
 * propre : `AccountTokenRevokerGuardTest` garde qu'ils y passent.
 */
class CalendarFeedRevocationTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
    }

    /** Un lien d'agenda du couple (agent, agence), et son chemin `.ics`. */
    private function feed(?Agency $agency = null): string
    {
        $issued = app(CalendarFeedService::class)->issue($this->agent, (int) ($agency ?? $this->agency)->id);

        return '/api/calendar-feed/'.$issued['token'].'.ics';
    }

    private function assertFeedsRevoked(User $user): void
    {
        $rows = CalendarFeed::query()->where('user_id', $user->id)->get();
        $this->assertNotEmpty($rows);
        foreach ($rows as $row) {
            $this->assertNotNull($row->revoked_at, "le lien #{$row->id} n'est pas révoqué");
            $this->assertNull($row->getRawOriginal('token_encrypted'));
        }
    }

    private function operator(): User
    {
        $root = User::factory()->create();
        $this->materializeRoleProfile($root, 'super_admin');

        return $root;
    }

    public function test_password_reset_by_the_forgot_link_kills_the_feed(): void
    {
        $path = $this->feed();
        $this->get($path)->assertOk();

        $token = Password::broker()->createToken($this->agent);
        $this->postJson('/api/auth/reset-password', [
            'email' => $this->agent->email,
            'token' => $token,
            'password' => 'N0uveau-mot-de-passe!',
            'password_confirmation' => 'N0uveau-mot-de-passe!',
        ])->assertOk();

        $this->get($path)->assertNotFound();
        $this->assertFeedsRevoked($this->agent);
    }

    public function test_revoking_a_session_from_the_account_kills_the_feed(): void
    {
        $path = $this->feed();
        $current = $this->agent->createToken('moi')->plainTextToken;
        $stolen = $this->agent->createToken('volé')->accessToken;

        $this->withHeader('Authorization', 'Bearer '.$current)
            ->deleteJson("/api/auth/sessions/{$stolen->id}")
            ->assertNoContent();
        $this->app['auth']->forgetGuards();

        $this->get($path)->assertNotFound();
        $this->assertFeedsRevoked($this->agent);
    }

    public function test_a_refused_session_revocation_leaves_the_feed_alone(): void
    {
        $path = $this->feed();
        $current = $this->agent->createToken('moi')->plainTextToken;

        $this->withHeader('Authorization', 'Bearer '.$current)
            ->deleteJson('/api/auth/sessions/999999999')
            ->assertNotFound();
        $this->app['auth']->forgetGuards();

        $this->get($path)->assertOk();
    }

    public function test_support_gestures_kill_the_feed(): void
    {
        $support = app(UserSupportService::class);

        $this->feed();
        $this->agent->createToken('a');
        $support->revokeSessions($this->operator(), $this->agent, 'Session volée signalée.', false);
        $this->assertFeedsRevoked($this->agent);

        $this->feed();
        $token = $this->agent->createToken('b')->accessToken;
        $support->revokeSession($this->operator(), $this->agent, (int) $token->id, 'Session volée signalée.');
        $this->assertFeedsRevoked($this->agent);

        $this->feed();
        $support->forcePasswordReset($this->operator(), $this->agent, 'Compte compromis.');
        $this->assertFeedsRevoked($this->agent);
    }

    public function test_requesting_the_account_deletion_kills_the_feed(): void
    {
        $this->feed();

        app(AccountDeletionService::class)->requestDeletion($this->agent);

        $this->assertFeedsRevoked($this->agent);
    }

    public function test_revoking_a_platform_profile_kills_the_feed(): void
    {
        $this->materializeRoleProfile($this->agent, 'super_admin');
        $this->feed();

        PlatformProfile::query()->where('user_id', $this->agent->id)->sole()->forceFill(['revoked_at' => now()])->save();

        $this->assertFeedsRevoked($this->agent);
    }

    /**
     * Suspendu dans X, il garde ses jetons pour Y : le lien de X est révoqué par écriture, et ne
     * revit pas à la réactivation ; celui de Y reste servi.
     */
    public function test_suspension_kills_the_feed_of_that_agency_even_after_reactivation(): void
    {
        $other = Agency::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $other);
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);

        $pathX = $this->feed();
        $pathY = $this->feed($other);

        $suspension = app(TeamMemberSuspensionService::class);
        $suspension->suspend($this->agency, $this->agent, $admin);
        $suspension->reactivate($this->agency, $this->agent, $admin);

        $this->get($pathX)->assertNotFound();
        $this->get($pathY)->assertOk();
        $this->assertNotNull(CalendarFeed::query()->where('user_id', $this->agent->id)->where('agency_id', $this->agency->id)->sole()->revoked_at);
    }

    /** Suspendu dans sa seule agence : jetons et liens tombent par le point commun. */
    public function test_suspending_the_only_profile_kills_tokens_and_feeds(): void
    {
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);
        $this->feed();
        $this->agent->createToken('a');

        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $admin);

        $this->assertSame(0, $this->agent->tokens()->count());
        $this->assertFeedsRevoked($this->agent);
    }

    /** L'autre voie de suspension d'un agent (`AgentProfileController`) révoque aussi le lien. */
    public function test_the_agent_profile_suspension_path_kills_the_feed_even_after_reactivation(): void
    {
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);
        $path = $this->feed();
        $profile = AgentProfile::query()->where('user_id', $this->agent->id)->sole();

        $invitations = app(AgentInvitationService::class);
        $invitations->suspend($profile, $admin);
        $invitations->suspend($profile->fresh(), $admin, active: true);

        $this->assertFeedsRevoked($this->agent);
        $this->get($path)->assertNotFound();
    }

    /** La fin d'une délégation révoque le lien du délégué ; une délégation neuve ne le ranime pas. */
    public function test_the_end_of_a_delegation_kills_the_feed(): void
    {
        $delegate = User::factory()->create();
        $this->materializeRoleProfile($delegate, 'owner', $this->agency);
        $delegation = RoleDelegation::factory()->forRole('agent')->create([
            'user_id' => $delegate->id,
            'delegator_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
        ]);
        $issued = app(CalendarFeedService::class)->issue($delegate, (int) $this->agency->id);
        $path = '/api/calendar-feed/'.$issued['token'].'.ics';
        $this->get($path)->assertOk();

        app(RoleDelegationService::class)->revoke($delegation, $this->agent);
        $this->assertFeedsRevoked($delegate);

        RoleDelegation::factory()->forRole('agent')->create([
            'user_id' => $delegate->id,
            'delegator_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
        ]);
        $this->get($path)->assertNotFound();
    }

    public function test_the_expiry_of_a_delegation_kills_the_feed(): void
    {
        $delegate = User::factory()->create();
        $this->materializeRoleProfile($delegate, 'owner', $this->agency);
        $delegation = RoleDelegation::factory()->forRole('agent')->create([
            'user_id' => $delegate->id,
            'delegator_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
        ]);
        app(CalendarFeedService::class)->issue($delegate, (int) $this->agency->id);

        app(RoleDelegationService::class)->expire($delegation);

        $this->assertFeedsRevoked($delegate);
    }

    /** Un délégué qui reste personnel par son profil garde son lien. */
    public function test_the_end_of_a_delegation_spares_a_member_still_staff(): void
    {
        $delegation = RoleDelegation::factory()->forRole('agency_admin')->create([
            'user_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
        ]);
        $path = $this->feed();

        app(RoleDelegationService::class)->expire($delegation);

        $this->get($path)->assertOk();
    }

    /** Passé bailleur dans l'agence, il n'en est plus personnel : son lien tombe par écriture. */
    public function test_changing_the_role_to_owner_kills_the_feed(): void
    {
        // Changer le rôle d'un membre est une action protégée : 2FA et step-up.
        $admin = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);
        $path = $this->feed();

        $this->actingAsWithStepUp($admin);
        $this->apiPut("/api/agencies/{$this->agency->id}/members/{$this->agent->id}/role", ['role' => 'owner'])
            ->assertOk();
        $this->app['auth']->forgetGuards();

        $this->assertFeedsRevoked($this->agent);
        $this->get($path)->assertNotFound();
    }
}
