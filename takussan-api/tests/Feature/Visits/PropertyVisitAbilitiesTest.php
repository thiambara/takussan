<?php

namespace Tests\Feature\Visits;

use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * P152.04 — le détail d'une visite dit, par `abilities.manage`, si le lecteur peut la confirmer, la
 * clore, la déclarer manquée, la déplacer ou l'annuler au nom de ceux qui gèrent le bien
 * (`PropertyVisitPolicy::update` et `agitPourLeBien`). La fiche montait ces gestes au bailleur d'un
 * bien d'agence, que l'API refuse (403 `visit.staff_only`).
 */
class PropertyVisitAbilitiesTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_le_bailleur_d_un_bien_d_agence_ne_gere_pas_la_visite(): void
    {
        $agence = $this->agence();
        $this->personnel($agence, 'agency_admin');
        $bailleur = $this->bailleur($agence);
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($agence, $bailleur)->id,
            'visitor_id' => $this->client()->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => $this->creneau(),
        ]);

        Sanctum::actingAs($bailleur);
        $this->getJson("/api/property-visits/{$visite->id}")->assertOk()
            ->assertJsonPath('data.abilities.manage', false);

        Sanctum::actingAs($this->personnel($agence));
        $this->getJson("/api/property-visits/{$visite->id}")->assertOk()
            ->assertJsonPath('data.abilities.manage', true);
    }

    public function test_le_proprietaire_d_un_bien_sans_agence_gere_la_visite(): void
    {
        $particulier = $this->client();
        $visiteur = $this->client();
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe(null, $particulier)->id,
            'visitor_id' => $visiteur->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => $this->creneau(),
        ]);

        Sanctum::actingAs($particulier);
        $this->getJson("/api/property-visits/{$visite->id}")->assertOk()
            ->assertJsonPath('data.abilities.manage', true);

        Sanctum::actingAs($visiteur);
        $this->getJson("/api/property-visits/{$visite->id}")->assertOk()
            ->assertJsonPath('data.abilities.manage', false);
    }
}
