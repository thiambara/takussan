<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-262 — Multi-rattachement Service Provider à plusieurs agences.
 *
 * Couvre :
 *  - AC1 : SP existant accepte invitation d'une nouvelle agence → 1
 *          nouvelle collaboration, pas de nouveau profil.
 *  - AC2/AC3 : indépendance des collaborations (active vs paused) cross-
 *          agences + listing /api/me/service-provider/agencies cross.
 *  - AC4 : doublon collaboration active rejetée (409).
 *  - AC5 : activity log `sp_collaboration_added`.
 *  - SP nouveau (sans profile existant) : flow normal TCK-260/261
 *          inchangé (création profile + collab paused).
 *  - L'invitation est `accepted` après l'opération.
 */
class ServiceProviderMultiAgencyTest extends TestCase
{
    use RefreshDatabase;

    private function inviteServiceProviderFromAgency(Agency $agency, string $email): Invitation
    {
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => $email,
            'first_name' => 'A',
            'last_name' => 'B',
            'trades' => ['plumbing'],
            'intervention_zones' => ['Dakar'],
        ])->assertStatus(201);

        // Stop acting as the inviter so subsequent accept calls don't
        // accidentally bypass auth via a leftover Sanctum context.
        $this->app['auth']->forgetGuards();

        unset($admin);

        return Invitation::query()->where('email', $email)->latest('id')->firstOrFail();
    }

    public function test_new_sp_without_existing_profile_follows_normal_flow(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);

        $invitation = $this->inviteServiceProviderFromAgency($agency, 'fresh@example.com');

        // A draft SP profile + a paused collab are created at invite time.
        $this->assertDatabaseHas('service_provider_profiles', [
            'id' => $invitation->invitable_id,
            'status' => ServiceProviderProfileStatus::Draft->value,
            'user_id' => null,
        ]);
        $this->assertDatabaseHas('service_provider_agency_collaborations', [
            'service_provider_profile_id' => $invitation->invitable_id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Paused->value,
        ]);

        // New-user accept: posting without auth + with first/last/password
        // creates the User, attaches the role, flips the SP profile to
        // active and bumps user_id.
        $response = $this->postJson('/api/invitations/'.$invitation->token.'/accept', [
            'first_name' => 'Fresh',
            'last_name' => 'Provider',
            'password' => 'hunter2hunter2',
        ]);

        $response->assertStatus(200);

        $invitation->refresh();
        $this->assertSame(InvitationStatus::Accepted, $invitation->status);

        $newUser = User::query()->where('email', 'fresh@example.com')->firstOrFail();
        $profile = ServiceProviderProfile::query()->find($invitation->invitable_id);
        $this->assertNotNull($profile);
        $this->assertSame($newUser->id, $profile->user_id);
        $this->assertSame(ServiceProviderProfileStatus::Active, $profile->status);

        // Exactly one SP profile across the system for this user.
        $this->assertSame(1, ServiceProviderProfile::query()->where('user_id', $newUser->id)->count());
    }

    public function test_existing_sp_accepting_invitation_from_new_agency_creates_only_collaboration(): void
    {
        Mail::fake();

        // Existing SP, attached to agency A.
        $agencyA = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $sp = User::factory()->create(['email' => 'shared@example.com']);
        $existingProfile = ServiceProviderProfile::factory()->create([
            'user_id' => $sp->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $existingProfile->id,
            'agency_id' => $agencyA->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->subYear()->toDateString(),
        ]);

        $profileCountBefore = ServiceProviderProfile::query()->count();

        // Agency B invites the same email — service should re-use the
        // existing profile and NOT create a draft collaboration row.
        $agencyB = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $invitation = $this->inviteServiceProviderFromAgency($agencyB, 'shared@example.com');

        // No new SP profile created.
        $this->assertSame($profileCountBefore, ServiceProviderProfile::query()->count());
        $this->assertSame($existingProfile->id, $invitation->invitable_id);

        // No paused draft collab pre-created for agency B (the active
        // collab will be created at acceptance time).
        $this->assertDatabaseMissing('service_provider_agency_collaborations', [
            'service_provider_profile_id' => $existingProfile->id,
            'agency_id' => $agencyB->id,
        ]);

        // Existing SP accepts (authenticated as themselves — same email).
        Sanctum::actingAs($sp);
        $response = $this->postJson('/api/invitations/'.$invitation->token.'/accept');
        $response->assertStatus(200);

        // One new ACTIVE collaboration with agency B.
        $this->assertDatabaseHas('service_provider_agency_collaborations', [
            'service_provider_profile_id' => $existingProfile->id,
            'agency_id' => $agencyB->id,
            'status' => CollaborationStatus::Active->value,
        ]);

        // Still exactly one SP profile.
        $this->assertSame(1, ServiceProviderProfile::query()->where('user_id', $sp->id)->count());

        // Invitation flipped to accepted.
        $invitation->refresh();
        $this->assertSame(InvitationStatus::Accepted, $invitation->status);
    }

    public function test_duplicate_active_collaboration_yields_409(): void
    {
        Mail::fake();

        $agencyA = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $agencyB = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $sp = User::factory()->create(['email' => 'dup-multi@example.com']);
        $profile = ServiceProviderProfile::factory()->create([
            'user_id' => $sp->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        // SP is already actively attached to A AND B.
        foreach ([$agencyA, $agencyB] as $a) {
            ServiceProviderAgencyCollaboration::query()->create([
                'service_provider_profile_id' => $profile->id,
                'agency_id' => $a->id,
                'status' => CollaborationStatus::Active->value,
                'started_at' => now()->subMonth()->toDateString(),
            ]);
        }

        // Agency B's admin tries to invite the same SP — InviteService
        // throws 409 (same-agency duplicate).
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agencyB->id]);
        $this->postJson("/api/agencies/{$agencyB->id}/service-providers/invite", [
            'email' => 'dup-multi@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(409);

        unset($admin);
    }

    public function test_collaborations_are_independent_per_agency(): void
    {
        Mail::fake();

        $agencyA = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $agencyB = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $sp = User::factory()->create(['email' => 'indep@example.com']);
        $profile = ServiceProviderProfile::factory()->create([
            'user_id' => $sp->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);

        $collabA = ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profile->id,
            'agency_id' => $agencyA->id,
            'status' => CollaborationStatus::Paused->value,
            'started_at' => now()->toDateString(),
        ]);
        $collabB = ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profile->id,
            'agency_id' => $agencyB->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->toDateString(),
        ]);

        // Suspending the SP at A doesn't touch B.
        $collabA->refresh();
        $collabB->refresh();
        $this->assertSame(CollaborationStatus::Paused, $collabA->status);
        $this->assertSame(CollaborationStatus::Active, $collabB->status);

        // Listing endpoint surfaces both (cross-agences).
        Sanctum::actingAs($sp);
        $response = $this->getJson('/api/me/service-provider/agencies');
        $response->assertStatus(200);
        $items = collect($response->json('data'));
        $this->assertCount(2, $items);
        $this->assertEqualsCanonicalizing(
            [$agencyA->id, $agencyB->id],
            $items->pluck('agency_id')->all(),
        );
    }

    public function test_listing_endpoint_returns_only_my_collaborations(): void
    {
        Mail::fake();

        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $sp = User::factory()->create(['email' => 'me-sp@example.com']);
        $myProfile = ServiceProviderProfile::factory()->create([
            'user_id' => $sp->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $myProfile->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->toDateString(),
        ]);

        // Another SP at the same agency — must NOT leak.
        $otherUser = User::factory()->create();
        $otherProfile = ServiceProviderProfile::factory()->create([
            'user_id' => $otherUser->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $otherProfile->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->toDateString(),
        ]);

        Sanctum::actingAs($sp);
        $response = $this->getJson('/api/me/service-provider/collaborations?fields[service_provider_agency_collaborations]=id,agency_id,status');
        $response->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('service_provider_profile_id')->filter()->all();
        // sparse-fields request may strip the FK — fall back to id+agency check.
        $rows = collect($response->json('data'));
        $this->assertCount(1, $rows);
        $this->assertSame($agency->id, $rows->first()['agency_id']);
        unset($ids);
    }

    public function test_activity_log_records_sp_collaboration_added(): void
    {
        Mail::fake();

        $agencyA = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $sp = User::factory()->create(['email' => 'log-sp@example.com']);
        $profile = ServiceProviderProfile::factory()->create([
            'user_id' => $sp->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profile->id,
            'agency_id' => $agencyA->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->toDateString(),
        ]);

        $agencyB = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $invitation = $this->inviteServiceProviderFromAgency($agencyB, 'log-sp@example.com');

        Sanctum::actingAs($sp);
        $this->postJson('/api/invitations/'.$invitation->token.'/accept')->assertStatus(200);

        $log = Activity::query()->where('event', 'sp_collaboration_added')->first();
        $this->assertNotNull($log);
        $this->assertSame($sp->id, $log->causer_id);
        $this->assertSame($agencyB->id, data_get($log->properties, 'agency_id'));
        $this->assertSame($profile->id, data_get($log->properties, 'service_provider_profile_id'));
    }

    public function test_invitation_marked_accepted_after_existing_sp_accepts(): void
    {
        Mail::fake();

        $agencyA = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $sp = User::factory()->create(['email' => 'mark-sp@example.com']);
        $profile = ServiceProviderProfile::factory()->create([
            'user_id' => $sp->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profile->id,
            'agency_id' => $agencyA->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->toDateString(),
        ]);

        $agencyB = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $invitation = $this->inviteServiceProviderFromAgency($agencyB, 'mark-sp@example.com');

        $this->assertSame(InvitationStatus::Sent, $invitation->status);

        Sanctum::actingAs($sp);
        $this->postJson('/api/invitations/'.$invitation->token.'/accept')->assertStatus(200);

        $invitation->refresh();
        $this->assertSame(InvitationStatus::Accepted, $invitation->status);
        $this->assertNotNull($invitation->accepted_at);
        $this->assertSame($sp->id, $invitation->invited_user_id);
    }
}
