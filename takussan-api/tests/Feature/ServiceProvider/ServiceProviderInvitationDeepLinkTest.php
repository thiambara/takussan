<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-592 — AC18 (P18) : le lien profond d'une invitation mène à une demande que le nouveau
 * prestataire peut ouvrir.
 *
 * `metadata.from_maintenance_request_id` n'était validé que comme un entier : une invitation pouvait
 * porter la demande d'une autre agence. Et la fin d'onboarding renvoyait vers une demande qui ne lui
 * était pas assignée — un 403 au bout du parcours.
 */
class ServiceProviderInvitationDeepLinkTest extends TestCase
{
    use RefreshDatabase;

    public function test_request_of_another_agency_is_refused(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->agencyWithAdmin();
        $foreign = $this->requestIn(Agency::factory()->create());

        Sanctum::actingAs($admin);

        $this->invite($agency, $foreign->id)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('metadata.from_maintenance_request_id');
    }

    public function test_terminal_request_is_refused(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->agencyWithAdmin();
        $closed = $this->requestIn($agency, MaintenanceStatus::Closed);

        Sanctum::actingAs($admin);

        $this->invite($agency, $closed->id)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('metadata.from_maintenance_request_id');
    }

    public function test_onboarding_assigns_the_deep_linked_request(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->agencyWithAdmin();
        $mr = $this->requestIn($agency);

        Sanctum::actingAs($admin);
        $this->invite($agency, $mr->id)->assertCreated();

        $invitation = Invitation::query()->where('email', 'plombier@example.com')->firstOrFail();
        $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Demba',
            'last_name' => 'Sow',
            'password' => 'Secret123!',
        ])->assertOk();

        $sp = ServiceProviderProfile::query()->findOrFail($invitation->invitable_id);
        $provider = User::query()->findOrFail($sp->user_id);
        $provider->forceFill(['phone_verified_at' => now()])->save();

        Sanctum::actingAs($provider);
        $this->postJson('/api/service-provider/onboard/complete', ['sp_profile_id' => $sp->id])
            ->assertOk()
            ->assertJsonPath('data.redirect_to_maintenance_request_id', $mr->id);

        $this->assertSame($provider->id, $mr->refresh()->assigned_to);
        $this->assertNull($mr->accepted_at);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();
    }

    /**
     * verif-592, B1 (sonde v07) — la fin d'onboarding REJOUÉE ne reprend pas une intervention
     * réassignée entre-temps, acceptée et démarrée par un autre prestataire.
     */
    public function test_replay_does_not_take_back_a_reassigned_request(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->agencyWithAdmin();
        $mr = $this->requestIn($agency);
        [$sp, $invited] = $this->onboardedThrough($agency, $admin, $mr);
        $this->assertSame($invited->id, $mr->refresh()->assigned_to);

        $other = $this->providerOf($agency);
        Sanctum::actingAs($admin);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $other->id])->assertOk();
        Sanctum::actingAs($other);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")->assertOk();
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'in_progress'])->assertOk();

        Sanctum::actingAs($invited);
        $this->postJson('/api/service-provider/onboard/complete', ['sp_profile_id' => $sp->id])->assertOk();

        $mr->refresh();
        $this->assertSame($other->id, $mr->assigned_to);
        $this->assertNotNull($mr->accepted_at);
        $this->assertSame(MaintenanceStatus::InProgress, $mr->status);
    }

    /** Une fois par invitation : désassigné puis rejoué, le prestataire ne se la reprend pas. */
    public function test_replay_does_not_take_back_a_request_freed_since(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->agencyWithAdmin();
        $mr = $this->requestIn($agency);
        [$sp, $invited] = $this->onboardedThrough($agency, $admin, $mr);

        Sanctum::actingAs($admin);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => null])->assertOk();
        $this->assertNull($mr->refresh()->assigned_to);

        Sanctum::actingAs($invited);
        $this->postJson('/api/service-provider/onboard/complete', ['sp_profile_id' => $sp->id])->assertOk();

        $this->assertNull($mr->refresh()->assigned_to);
    }

    /** Une demande déjà tenue par un autre n'est pas prise, même à la première fin d'onboarding. */
    public function test_a_request_assigned_meanwhile_is_not_taken(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->agencyWithAdmin();
        $mr = $this->requestIn($agency);
        $other = $this->providerOf($agency);

        [$sp, $invited] = $this->onboardedThrough($agency, $admin, $mr, function () use ($mr, $other): void {
            $mr->forceFill(['assigned_to' => $other->id])->save();
        });

        $this->assertSame($other->id, $mr->refresh()->assigned_to);
    }

    /**
     * verif-592 passe 2 (N2, sonde p01) — le lien se consomme à la PREMIÈRE fin d'onboarding, même
     * sans assignation : la demande prise par un autre, puis rendue par son refus, ne revient pas
     * au prestataire invité qui rejoue la fin d'onboarding.
     */
    public function test_the_link_is_consumed_even_when_the_first_completion_assigns_nothing(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->agencyWithAdmin();
        $mr = $this->requestIn($agency);
        $other = $this->providerOf($agency);

        [$sp, $invited] = $this->onboardedThrough($agency, $admin, $mr, function () use ($mr, $other): void {
            $mr->forceFill(['assigned_to' => $other->id])->save();
        });
        $this->assertSame($other->id, $mr->refresh()->assigned_to);
        $this->assertNotNull(data_get($sp->invitations()->firstOrFail()->metadata, 'deep_link_consumed_at'));

        Sanctum::actingAs($other);
        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'Pas disponible'])->assertOk();
        $this->assertNull($mr->refresh()->assigned_to);

        Sanctum::actingAs($invited);
        $this->postJson('/api/service-provider/onboard/complete', ['sp_profile_id' => $sp->id])->assertOk();

        $this->assertNull($mr->refresh()->assigned_to);
    }

    /** `completed` n'est pas terminal, mais les travaux sont faits : rien à assigner. */
    public function test_a_completed_request_is_not_assigned(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->agencyWithAdmin();
        $mr = $this->requestIn($agency);

        $this->onboardedThrough($agency, $admin, $mr, function () use ($mr): void {
            $mr->forceFill(['status' => MaintenanceStatus::Completed, 'completed_at' => now()])->save();
        });

        $this->assertNull($mr->refresh()->assigned_to);
    }

    /** verif-592, mineur 7 (X17) — l'éligibilité se rejuge en fin d'onboarding. */
    public function test_a_provider_no_longer_assignable_is_not_assigned(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->agencyWithAdmin();
        $mr = $this->requestIn($agency);

        $this->onboardedThrough($agency, $admin, $mr, function (ServiceProviderProfile $sp) use ($agency): void {
            // Une pause posée par l'agence ne se lève pas à la fin d'onboarding.
            ServiceProviderAgencyCollaboration::query()
                ->where('service_provider_profile_id', $sp->id)
                ->where('agency_id', $agency->id)
                ->update(['status' => CollaborationStatus::Paused->value, 'metadata' => json_encode(['paused_by' => 1])]);
        });

        $this->assertNull($mr->refresh()->assigned_to);
    }

    /** Seule l'invitation ACCEPTÉE porte le lien : une invitation plus récente non acceptée, non. */
    public function test_only_the_accepted_invitation_carries_the_link(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->agencyWithAdmin();
        $mr = $this->requestIn($agency);
        $second = $this->requestIn($agency);

        $this->onboardedThrough($agency, $admin, $mr, function (ServiceProviderProfile $sp) use ($second): void {
            $accepted = $sp->invitations()->firstOrFail();
            $pending = $accepted->replicate();
            $pending->forceFill([
                'token' => str_repeat('b', 64),
                'status' => InvitationStatus::Sent,
                'accepted_at' => null,
                'metadata' => ['from_maintenance_request_id' => $second->id],
            ])->save();
        });

        $this->assertNull($second->refresh()->assigned_to);
        $this->assertNotNull($mr->refresh()->assigned_to);
    }

    /** @return array{Agency, User} */
    private function agencyWithAdmin(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        // TCK-589 — l'admin d'agence agit sous 2FA (`RequireTwoFactor`), comme `actingAsRole`.
        $admin = User::factory()->create([
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);

        return [$agency, $admin];
    }

    private function requestIn(Agency $agency, MaintenanceStatus $status = MaintenanceStatus::Open): MaintenanceRequest
    {
        return MaintenanceRequest::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agency->id])->id,
            'assigned_to' => null,
            'status' => $status,
        ]);
    }

    private function invite(Agency $agency, int $maintenanceRequestId)
    {
        return $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'plombier@example.com',
            'first_name' => 'Demba',
            'last_name' => 'Sow',
            'phone' => '+221770000099',
            'trades' => ['plumbing'],
            'metadata' => ['from_maintenance_request_id' => $maintenanceRequestId],
        ]);
    }

    /**
     * Invitation avec lien profond vers `$mr`, acceptation, téléphone vérifié, puis fin
     * d'onboarding. `$before` s'exécute juste avant la fin d'onboarding.
     *
     * @return array{ServiceProviderProfile, User}
     */
    private function onboardedThrough(Agency $agency, User $admin, MaintenanceRequest $mr, ?callable $before = null): array
    {
        Sanctum::actingAs($admin);
        $this->invite($agency, $mr->id)->assertCreated();
        $invitation = Invitation::query()->where('email', 'plombier@example.com')->firstOrFail();
        $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Demba',
            'last_name' => 'Sow',
            'password' => 'Secret123!',
        ])->assertOk();

        $sp = ServiceProviderProfile::query()->findOrFail($invitation->invitable_id);
        $provider = User::query()->findOrFail($sp->user_id);
        $provider->forceFill(['phone_verified_at' => now()])->save();

        if ($before !== null) {
            $before($sp);
        }

        Sanctum::actingAs($provider);
        $this->postJson('/api/service-provider/onboard/complete', ['sp_profile_id' => $sp->id])->assertOk();

        return [$sp, $provider];
    }

    private function providerOf(Agency $agency): User
    {
        $user = User::factory()->create();
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $user->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $sp->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->subMonth()->toDateString(),
        ]);

        return $user;
    }
}
