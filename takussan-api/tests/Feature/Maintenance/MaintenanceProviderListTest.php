<?php

namespace Tests\Feature\Maintenance;

use App\Models\Address;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 (P14, P17) — « Mes interventions » : triée par créneau, avec le quartier et l'agence, et
 * « Nouvelle demande » n'est plus proposée à qui prendrait un 403 en la créant.
 */
class MaintenanceProviderListTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_provider_list_is_sorted_by_slot_with_quarter_and_agency(): void
    {
        ['mr' => $later, 'provider' => $provider, 'property' => $property, 'agency' => $agency] = $this->maintenanceScenario(
            MaintenanceStatus::Assigned,
            ['scheduled_at' => now()->addDays(3)],
        );
        $sooner = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $later->requester_id,
            'assigned_to' => $provider->id,
            'status' => MaintenanceStatus::Assigned,
            'scheduled_at' => now()->addDay(),
        ]);
        ($property->address ?? Address::factory()->create([
            'addressable_type' => $property->getMorphClass(),
            'addressable_id' => $property->id,
        ]))->update(['neighborhood' => 'Médina']);

        Sanctum::actingAs($provider);

        $response = $this->getJson('/api/maintenance-requests?sort=scheduled_at&include=property'
            .'&fields[maintenance_requests]=id,property_id,scheduled_at&fields[properties]=id,title,slug,agency_id')
            ->assertOk();

        $this->assertSame([$sooner->id, $later->id], array_column($response->json('data'), 'id'));
        $response->assertJsonPath('data.0.property.location.quarter', 'Médina')
            ->assertJsonPath('data.0.property.agency.id', $agency->id)
            ->assertJsonPath('data.0.property.agency.name', $agency->name)
            ->assertJsonPath('meta.abilities.can_create', false);

        // Le témoin : ce que le bouton aurait produit.
        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Fuite',
            'description' => 'Fuite sous l\'évier de la cuisine.',
            'category' => 'plumbing',
        ])->assertForbidden();
    }

    public function test_tenant_and_landlord_are_offered_a_new_request(): void
    {
        ['tenant' => $tenant, 'landlord' => $landlord] = $this->maintenanceScenario();

        Sanctum::actingAs($tenant);
        $this->getJson('/api/maintenance-requests')->assertOk()->assertJsonPath('meta.abilities.can_create', true);

        Sanctum::actingAs($landlord);
        $this->getJson('/api/maintenance-requests')->assertOk()->assertJsonPath('meta.abilities.can_create', true);
    }
}
