<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * P130.03 (TCK-1330) — supprimer un bien annule ses interventions non terminées, motif tracé.
 *
 * Avant, elles restaient ouvertes : l'agence ne les voyait plus (la policy et `scopeVisibleTo`
 * passent par le bien, que la suppression douce rend nul), le locataire les voyait encore
 * `open`, et plus personne ne pouvait les clore.
 */
class MaintenanceDUnBienSupprimeTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_les_interventions_non_terminees_d_un_bien_supprime_sont_annulees(): void
    {
        ['property' => $property, 'landlord' => $landlord, 'tenant' => $tenant, 'mr' => $open]
            = $this->maintenanceScenario(MaintenanceStatus::Open);

        $enCours = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $tenant->id,
            'status' => MaintenanceStatus::InProgress,
        ]);
        $terminee = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $tenant->id,
            'status' => MaintenanceStatus::Completed,
        ]);
        $close = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $tenant->id,
            'status' => MaintenanceStatus::Closed,
        ]);
        // Témoin : l'intervention d'un autre bien ne bouge pas.
        ['mr' => $ailleurs] = $this->maintenanceScenario(MaintenanceStatus::Open);

        $this->actingAs($landlord);
        $property->delete();

        $this->assertSame(MaintenanceStatus::Cancelled, $open->refresh()->status);
        $this->assertSame(MaintenanceStatus::Cancelled, $enCours->refresh()->status);
        $this->assertSame(MaintenanceStatus::Completed, $terminee->refresh()->status);
        $this->assertSame(MaintenanceStatus::Closed, $close->refresh()->status);
        $this->assertSame(MaintenanceStatus::Open, $ailleurs->refresh()->status);

        // Le motif est tracé, une ligne par intervention annulée.
        $traces = Activity::query()->where('event', 'maintenance.cancelled_property_deleted')->get();
        $this->assertEqualsCanonicalizing([$open->id, $enCours->id], $traces->pluck('subject_id')->all());
        $this->assertSame('property_deleted', $traces->first()->properties['reason']);
        $this->assertSame($property->id, $traces->first()->properties['property_id']);

        // Le locataire demandeur ne la voit plus ouverte.
        Sanctum::actingAs($tenant);
        $this->getJson("/api/maintenance-requests/{$open->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }
}
