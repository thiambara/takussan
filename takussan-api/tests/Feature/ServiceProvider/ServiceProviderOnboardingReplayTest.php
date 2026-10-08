<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-592 — AC18b : la fin d'onboarding est rejouable, elle ne doit rien lever qu'elle n'a pas posé.
 *
 * Aucune garde « déjà fait », OTP sauté quand le téléphone est vérifié : chaque appel repassait le
 * profil à `active` et TOUTES les collaborations `paused` à `active`. Un prestataire suspendu par la
 * plateforme ou mis en pause par une agence se rétablissait d'un appel.
 */
class ServiceProviderOnboardingReplayTest extends TestCase
{
    use RefreshDatabase;

    public function test_replay_activates_a_pending_invitation_but_not_an_agency_pause(): void
    {
        [$user, $sp] = $this->verifiedProvider(ServiceProviderProfileStatus::Active);
        $agencyPause = $this->collaboration($sp, ['paused_by' => User::factory()->create()->id, 'paused_at' => now()->toIso8601String()]);
        $pendingInvitation = $this->collaboration($sp, null);

        Sanctum::actingAs($user);
        $this->postJson('/api/service-provider/onboard/complete', ['sp_profile_id' => $sp->id])
            ->assertOk()
            ->assertJsonPath('data.activated_collaborations', 1);

        $this->assertSame(CollaborationStatus::Paused, $agencyPause->refresh()->status);
        $this->assertSame(CollaborationStatus::Active, $pendingInvitation->refresh()->status);
    }

    public function test_suspended_profile_cannot_reactivate_itself(): void
    {
        [$user, $sp] = $this->verifiedProvider(ServiceProviderProfileStatus::Suspended);
        $pendingInvitation = $this->collaboration($sp, null);

        Sanctum::actingAs($user);
        $this->postJson('/api/service-provider/onboard/complete', ['sp_profile_id' => $sp->id])->assertForbidden();

        $this->assertSame(ServiceProviderProfileStatus::Suspended, $sp->refresh()->status);
        $this->assertSame(CollaborationStatus::Paused, $pendingInvitation->refresh()->status);
    }

    /** @return array{User, ServiceProviderProfile} */
    private function verifiedProvider(ServiceProviderProfileStatus $status): array
    {
        $user = User::factory()->create(['phone' => '+221770000001', 'phone_verified_at' => now()]);
        $sp = ServiceProviderProfile::factory()->create(['user_id' => $user->id, 'status' => $status->value]);

        return [$user, $sp];
    }

    private function collaboration(ServiceProviderProfile $sp, ?array $metadata): ServiceProviderAgencyCollaboration
    {
        return ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $sp->id,
            'agency_id' => Agency::factory()->create()->id,
            'status' => CollaborationStatus::Paused->value,
            'started_at' => now()->toDateString(),
            'metadata' => $metadata,
        ]);
    }
}
