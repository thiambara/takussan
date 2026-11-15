<?php

namespace Tests\Feature\Visits;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * Vérification de TCK-2589 (V1) — l'agent assigné ne lit en liste la visite d'un bien d'agence que
 * tant qu'il est du personnel de cette agence (`VisitesLisibles`, passe 3, M7′). Parti ou suspendu,
 * il la perd. La règle était antérieure au ticket et n'était tenue par aucun test ;
 * `VisitesLisibles` en fait désormais aussi la règle du fil de la fiche client
 * (`CustomerTimelineTest`, même trou côté fil).
 */
class VisiteDeLAgentPartiTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->bien = $this->bienDe($this->agence, $this->bailleur($this->agence));
    }

    private function visiteAssigneeA(User $agent): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => $this->bien->id,
            'agent_id' => $agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDays(2),
        ]);
    }

    /** @return list<int> */
    private function listees(User $lecteur): array
    {
        Sanctum::actingAs($lecteur->fresh());

        return array_column($this->getJson('/api/property-visits')->assertOk()->json('data'), 'id');
    }

    public function test_l_agent_parti_de_l_agence_perd_en_liste_la_visite_qui_lui_reste_assignee(): void
    {
        $agent = $this->personnel($this->agence);
        $visite = $this->visiteAssigneeA($agent);

        // Témoin : du personnel, il la lit.
        $this->assertContains($visite->id, $this->listees($agent));

        AgentProfile::query()->where('user_id', $agent->id)->delete();
        $this->assertSame($agent->id, $visite->fresh()->agent_id);

        $this->assertNotContains($visite->id, $this->listees($agent));
    }

    public function test_l_agent_suspendu_perd_en_liste_la_visite_qui_lui_reste_assignee(): void
    {
        $agent = $this->personnel($this->agence);
        $visite = $this->visiteAssigneeA($agent);
        $this->assertContains($visite->id, $this->listees($agent));

        AgentProfile::query()->where('user_id', $agent->id)->update(['status' => AgentProfileStatus::Suspended]);

        $this->assertNotContains($visite->id, $this->listees($agent));
    }
}
