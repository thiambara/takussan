<?php

namespace Tests\Feature\Visits;

use App\Models\Agency;
use App\Models\Enums\VisitCancelledBy;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2871 (AC4, AC5) — ce que le client lit de sa visite :
 *   · le QUARTIER dès la demande (`property.neighborhood`), quand la rue (`property.address.line`) reste
 *     réservée à la visite confirmée (règle d'`adresseLisible`, inchangée) ;
 *   · qui a annulé (`cancelled_by` : `visitor` | `agency`), pour « Annulée par vous ».
 */
class VisitResourceNeighborhoodTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $visiteur;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->visiteur = $this->client();
        $this->bien = $this->bienDe($this->agence);
        $this->bien->address()->create(['street' => '12 rue des Almadies', 'neighborhood' => 'Ngor', 'city' => 'Dakar', 'country' => 'SN']);
    }

    private function visite(VisitStatus $statut = VisitStatus::Scheduled): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => $this->bien->id,
            'visitor_id' => $this->visiteur->id,
            'agent_id' => $this->agent->id,
            'status' => $statut,
            'scheduled_at' => $this->creneau(),
        ]);
    }

    public function test_ac4_le_client_lit_le_quartier_de_sa_visite_demandee_jamais_la_rue(): void
    {
        $visite = $this->visite();
        Sanctum::actingAs($this->visiteur);

        $detail = $this->getJson("/api/property-visits/{$visite->id}")->assertOk();
        $detail->assertJsonPath('data.property.neighborhood', 'Ngor');
        $this->assertArrayNotHasKey('address', $detail->json('data.property'));

        $liste = $this->getJson('/api/property-visits?include=property')->assertOk();
        $liste->assertJsonPath('data.0.property.neighborhood', 'Ngor');
        $this->assertArrayNotHasKey('address', $liste->json('data.0.property'));
        $this->assertStringNotContainsString('rue des Almadies', $liste->getContent());
    }

    public function test_ac4_une_fois_confirmee_la_rue_est_lisible(): void
    {
        $visite = $this->visite(VisitStatus::Confirmed);
        Sanctum::actingAs($this->visiteur);

        $this->getJson("/api/property-visits/{$visite->id}")->assertOk()
            ->assertJsonPath('data.property.neighborhood', 'Ngor')
            ->assertJsonPath('data.property.address.line', '12 rue des Almadies');
    }

    public function test_ac5_le_client_qui_annule_lit_visitor(): void
    {
        $visite = $this->visite();
        Sanctum::actingAs($this->visiteur);

        $this->postJson("/api/property-visits/{$visite->id}/cancel")->assertOk()
            ->assertJsonPath('data.cancelled_by', 'visitor');
        $this->getJson("/api/property-visits/{$visite->id}")->assertJsonPath('data.cancelled_by', 'visitor');
        $this->assertSame(VisitCancelledBy::Visitor, $visite->fresh()->cancelled_by);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/property-visits/{$visite->id}")->assertJsonPath('data.cancelled_by', 'visitor');
    }

    public function test_ac5_une_visite_annulee_par_l_agence_rend_agency(): void
    {
        $visite = $this->visite(VisitStatus::Confirmed);
        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/cancel")->assertOk()
            ->assertJsonPath('data.cancelled_by', 'agency');

        Sanctum::actingAs($this->visiteur);
        $this->getJson("/api/property-visits/{$visite->id}")->assertJsonPath('data.cancelled_by', 'agency');
        $this->getJson('/api/property-visits?fields[property_visits]=id,status,cancelled_by')
            ->assertJsonPath('data.0.cancelled_by', 'agency');
    }

    public function test_une_visite_non_annulee_rend_cancelled_by_nul(): void
    {
        $visite = $this->visite();
        Sanctum::actingAs($this->visiteur);

        $this->getJson("/api/property-visits/{$visite->id}")->assertJsonPath('data.cancelled_by', null);
    }
}
