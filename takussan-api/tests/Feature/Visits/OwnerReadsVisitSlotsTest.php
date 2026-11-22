<?php

namespace Tests\Feature\Visits;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2869 (ADR-0112) — « Autre créneau » se choisit sur la grille de l'agent
 * (`GET /api/property-visits/slots`). Le bailleur à qui l'agence confie ses visites la lit pour SES
 * biens ; réglage faux, ou bien d'un autre bailleur : le même 403 qu'avant.
 */
class OwnerReadsVisitSlotsTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $bailleur;

    private Property $bien;

    private string $jour;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->bailleur = $this->bailleur($this->agence);
        $this->bien = $this->bienDe($this->agence, $this->bailleur);
        $this->jour = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(2)->format('Y-m-d');
    }

    private function confier(bool $oui = true): void
    {
        $this->agence->update(['settings' => array_replace($this->agence->settings ?? [], ['owners_confirm_visits' => $oui])]);
    }

    private function grille(Property $bien): TestResponse
    {
        return $this->getJson('/api/property-visits/slots?'.http_build_query([
            'property_id' => $bien->id,
            'date' => $this->jour,
            'agent_id' => $this->agent->id,
        ]));
    }

    public function test_reglage_vrai_le_bailleur_lit_la_grille_de_l_agent_de_son_bien(): void
    {
        $this->confier();
        Sanctum::actingAs($this->bailleur);

        $this->grille($this->bien)->assertOk()
            ->assertJsonPath('data.date', $this->jour)
            ->assertJsonStructure(['data' => ['slots']]);
    }

    public function test_reglage_faux_le_bailleur_recoit_403(): void
    {
        Sanctum::actingAs($this->bailleur);

        $this->grille($this->bien)->assertForbidden();
    }

    public function test_reglage_vrai_le_bien_d_un_autre_bailleur_reste_403(): void
    {
        $this->confier();
        $autre = $this->bienDe($this->agence, $this->bailleur($this->agence));
        Sanctum::actingAs($this->bailleur);

        $this->grille($autre)->assertForbidden();
    }
}
