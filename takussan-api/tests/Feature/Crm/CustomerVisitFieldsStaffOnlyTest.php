<?php

namespace Tests\Feature\Crm;

use App\Models\Customer;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * Vérification adverse de TCK-2588 — les visites d'une fiche (`upcoming_visits`, `visits_count`, la
 * prochaine action « visite » et le tri `next_action_at`) sont au seul personnel de l'agence de la
 * fiche. Le bailleur auteur d'une fiche lisait sinon les visites du client sur le bien d'un AUTRE
 * bailleur, que `PropertyVisitPolicy::view` lui refuse (403).
 */
class CustomerVisitFieldsStaffOnlyTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private User $bailleurAuteur;

    private User $agent;

    private Customer $fiche;

    private Property $bienDUnAutre;

    private PropertyVisit $visite;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $agence = $this->agence();
        $this->bailleurAuteur = $this->bailleur($agence);
        $autreBailleur = $this->bailleur($agence);
        $this->agent = $this->personnel($agence, 'agency_admin');
        $this->fiche = $this->ficheClient($agence, null, ['added_by_id' => $this->bailleurAuteur->id]);
        $this->bienDUnAutre = $this->bienDe($agence, $autreBailleur);
        $this->visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDUnAutre->id, 'customer_id' => $this->fiche->id, 'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed, 'scheduled_at' => now()->addDay(),
        ]);
    }

    private function lire(): array
    {
        return $this->getJson("/api/customers/{$this->fiche->id}?fields[customers]=id,first_name,next_action&include=upcomingVisits,visitsCount")
            ->assertOk()->json('data');
    }

    public function test_le_bailleur_auteur_ne_lit_aucune_visite_de_sa_fiche(): void
    {
        Sanctum::actingAs($this->bailleurAuteur);
        $this->getJson("/api/property-visits/{$this->visite->id}")->assertForbidden();

        $data = $this->lire();

        $this->assertArrayNotHasKey('upcoming_visits', $data);
        $this->assertArrayNotHasKey('visits_count', $data);
        $this->assertNull($data['next_action']);
        $this->assertStringNotContainsString((string) $this->bienDUnAutre->id, json_encode($data['next_action'] ?? []));
    }

    public function test_le_personnel_de_l_agence_lit_les_visites_de_la_fiche(): void
    {
        Sanctum::actingAs($this->agent);

        $data = $this->lire();

        $this->assertSame([$this->bienDUnAutre->id], collect($data['upcoming_visits'])->pluck('property_id')->all());
        $this->assertSame(1, $data['visits_count']);
        $this->assertSame('visit', $data['next_action']['type']);
        $this->assertSame($this->visite->id, $data['next_action']['id']);
    }

    /**
     * Le tri ne trahit pas l'heure d'une visite tue : pour le bailleur, la fiche dont la seule action
     * est une visite (demain) passe APRÈS la fiche à tâche (dans deux jours), sans action.
     */
    public function test_le_tri_du_bailleur_ignore_les_visites_qu_il_ne_lit_pas(): void
    {
        $ficheATache = $this->ficheClient($this->fiche->agency, null, ['added_by_id' => $this->bailleurAuteur->id]);
        Task::factory()->create([
            'taskable_type' => Customer::class, 'taskable_id' => $ficheATache->id,
            'created_by_id' => $this->bailleurAuteur->id, 'assigned_to_id' => $this->bailleurAuteur->id,
            'status' => Task::OPEN_STATUSES[0], 'due_at' => now()->addDays(2),
        ]);

        Sanctum::actingAs($this->bailleurAuteur);
        $ids = collect($this->getJson('/api/customers?sort=next_action_at&fields[customers]=id')->assertOk()->json('data'))
            ->pluck('id')->all();
        $this->assertSame([$ficheATache->id, $this->fiche->id], $ids);

        // Le personnel, lui, voit la visite de demain avant la tâche.
        Sanctum::actingAs($this->agent);
        $ids = collect($this->getJson('/api/customers?sort=next_action_at&fields[customers]=id')->assertOk()->json('data'))
            ->pluck('id')->all();
        $this->assertSame([$this->fiche->id, $ficheATache->id], $ids);
    }
}
