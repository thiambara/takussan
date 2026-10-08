<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC4 : collaboration finie ou profil suspendu = plus d'accès, historique compris.
 *
 * La policy ne lisait que `assigned_to === $user->id`. Chaque refus est précédé du même appel rendu
 * 200 tant que la collaboration est active : sans ce témoin, une policy qui refuserait tout
 * prestataire rendrait ce fichier vert.
 */
class MaintenanceCollaborationAccessTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_ended_collaboration_closes_access_and_unassigns_open_requests(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'agency' => $agency, 'property' => $property] = $this->maintenanceScenario(MaintenanceStatus::InProgress);
        $quote = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'assigned_to' => $provider->id,
            'status' => MaintenanceStatus::QuoteRequested,
        ]);

        Sanctum::actingAs($provider);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();
        $this->assertContains($mr->id, $this->listedIds());

        $collaboration = $provider->serviceProviderProfile->agencyCollaborations()->where('agency_id', $agency->id)->firstOrFail();
        $this->patchJson("/api/me/service-provider/collaborations/{$collaboration->id}", ['status' => 'ended'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ended');

        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertForbidden();
        $this->assertNotContains($mr->id, $this->listedIds());
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['resolution_notes' => 'x'])->assertForbidden();

        foreach ([$mr, $quote] as $request) {
            $request->refresh();
            $this->assertNull($request->assigned_to);
            $this->assertSame(MaintenanceStatus::Open, $request->status);
        }
    }

    public function test_suspended_profile_closes_access(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress);

        Sanctum::actingAs($provider);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();

        ServiceProviderProfile::query()->where('user_id', $provider->id)
            ->update(['status' => ServiceProviderProfileStatus::Suspended->value]);

        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertForbidden();
        $this->assertNotContains($mr->id, $this->listedIds());
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['resolution_notes' => 'x'])->assertForbidden();
    }

    /** @return list<int> */
    private function listedIds(): array
    {
        return collect($this->getJson('/api/maintenance-requests')->assertOk()->json('data'))->pluck('id')->all();
    }
}
