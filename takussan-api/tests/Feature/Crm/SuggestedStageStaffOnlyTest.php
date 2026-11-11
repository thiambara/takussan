<?php

namespace Tests\Feature\Crm;

use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * Vérification adverse de TCK-2591 — l'étape proposée est un outil de pilotage de l'agence : le
 * bailleur auteur d'une fiche ne lit pas `suggested_stage` (il y apprenait l'existence, le verdict
 * « intéressé » et l'heure du compte rendu d'une visite sur le bien d'un AUTRE bailleur) et ne peut
 * pas l'écarter ; le personnel de l'agence, si.
 */
class SuggestedStageStaffOnlyTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private User $bailleurAuteur;

    private User $agent;

    private Customer $fiche;

    private PropertyVisit $visite;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $agence = $this->agence();
        $this->bailleurAuteur = $this->bailleur($agence);
        $autreBailleur = $this->bailleur($agence);
        $this->agent = $this->personnel($agence);
        $this->travelTo(now()->subDay());
        $this->fiche = $this->ficheClient($agence, null, ['added_by_id' => $this->bailleurAuteur->id, 'pipeline_stage' => CustomerPipelineStage::Prospect]);
        $this->travelBack();
        $this->visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($agence, $autreBailleur)->id, 'customer_id' => $this->fiche->id, 'agent_id' => $this->agent->id,
            'status' => VisitStatus::Completed, 'scheduled_at' => now()->subHours(3), 'completed_at' => now()->subHours(2),
        ]);
        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$this->visite->id}/report", ['outcome' => 'interested', 'note' => 'secret'])->assertCreated();
    }

    private function etape(): mixed
    {
        return $this->getJson("/api/customers/{$this->fiche->id}?fields[customers]=id,first_name,suggested_stage")
            ->assertOk()->json('data.suggested_stage');
    }

    public function test_le_personnel_lit_l_etape_proposee(): void
    {
        Sanctum::actingAs($this->agent);

        $this->assertSame('visit_interested', $this->etape()['reason']);
    }

    public function test_le_bailleur_auteur_ne_lit_ni_n_ecarte_l_etape_proposee(): void
    {
        Sanctum::actingAs($this->bailleurAuteur);
        $this->getJson("/api/property-visits/{$this->visite->id}")->assertForbidden();

        $this->assertNull($this->etape());
        $this->assertNull(collect($this->getJson('/api/customers?fields[customers]=id,suggested_stage')->assertOk()->json('data'))
            ->firstWhere('id', $this->fiche->id)['suggested_stage']);

        $this->postJson("/api/customers/{$this->fiche->id}/suggested-stage/dismiss", ['reason_event' => 'visit_interested'])
            ->assertForbidden();
    }
}
