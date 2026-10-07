<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Invitation;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
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

    /** @return array{Agency, User} */
    private function agencyWithAdmin(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $admin = User::factory()->create();
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
}
