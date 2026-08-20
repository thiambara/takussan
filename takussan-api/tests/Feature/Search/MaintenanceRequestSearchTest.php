<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\Enums\MaintenancePriority;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

class MaintenanceRequestSearchTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_maintenance_search_is_typo_tolerant(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);
        MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'title' => 'Fuite robinet cuisine',
        ]);
        $this->indexSearchable(MaintenanceRequest::class);

        $this->getJson('/api/maintenance-requests?filter[search]=robinat')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    /**
     * AC1 — les trois demandes partagent la même priorité et sont créées dans
     * l'ordre INVERSE de leur pertinence, de sorte que le tri par défaut du
     * contrôleur (`-priority`, `-created_at`) rendrait l'ordre opposé.
     */
    public function test_maintenance_search_ranks_by_relevance_not_by_date(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);

        $exact = $this->makeRequest($property, 'Ndiayefall', now()->subDays(3));
        $oneTypo = $this->makeRequest($property, 'Ndiayefalt', now()->subDays(2));
        $twoTypos = $this->makeRequest($property, 'Ndiayefaxt', now()->subDay());

        $this->indexSearchable(MaintenanceRequest::class);

        $ids = $this->getJson('/api/maintenance-requests?filter[search]=Ndiayefall&fields[maintenance_requests]=id,title')
            ->assertOk()
            ->assertJsonPath('meta.total', 3)
            ->json('data.*.id');

        $this->assertSame([$exact->id, $oneTypo->id, $twoTypos->id], $ids);
    }

    public function test_maintenance_search_never_leaks_across_agencies(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agencyA]);

        $propertyA = Property::factory()->create(['agency_id' => $agencyA->id]);
        $propertyB = Property::factory()->create(['agency_id' => $agencyB->id]);
        $stranger = User::factory()->create();

        MaintenanceRequest::factory()->create([
            'property_id' => $propertyA->id,
            'title' => 'Probleme chaudiere unique',
        ]);
        MaintenanceRequest::factory()->create([
            'property_id' => $propertyB->id,
            'requester_id' => $stranger->id,
            'title' => 'Probleme chaudiere unique',
        ]);
        $this->indexSearchable(MaintenanceRequest::class);

        $response = $this->getJson('/api/maintenance-requests?filter[search]=chaudiere')->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_soft_deleted_maintenance_request_is_not_searchable(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $request = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'title' => 'Intervention fantome',
        ]);
        $request->delete();
        $this->indexSearchable(MaintenanceRequest::class);

        $this->getJson('/api/maintenance-requests?filter[search]=fantome')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }

    private function makeRequest(Property $property, string $title, \DateTimeInterface $createdAt): MaintenanceRequest
    {
        return MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'title' => $title,
            'description' => 'Sans rapport avec le terme cherche.',
            'priority' => MaintenancePriority::Normal,
            'created_at' => $createdAt,
        ]);
    }
}
