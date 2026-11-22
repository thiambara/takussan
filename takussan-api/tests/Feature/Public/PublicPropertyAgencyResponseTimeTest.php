<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2935 — la lecture publique d'un bien porte le délai de réponse médian de son agence
 * (`agency.median_response_minutes`), la colonne même que sert la fiche publique d'agence.
 *
 * Deux valeurs éprouvées (120 et `null`) : une clé figée à l'une ou l'autre rougit ; la comparaison
 * avec `GET /api/public/agencies/{slug}` rougit sur toute seconde définition.
 */
class PublicPropertyAgencyResponseTimeTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_bien_public_rend_le_delai_mesure_de_son_agence(): void
    {
        $bien = $this->bienDeLAgence('agence-rapide', 120);

        $this->getJson('/api/public/properties/'.$bien->slug)
            ->assertOk()
            ->assertJsonPath('data.agency.median_response_minutes', 120);
    }

    public function test_une_agence_sans_mesure_rend_null(): void
    {
        $bien = $this->bienDeLAgence('agence-sans-mesure', null);

        $reponse = $this->getJson('/api/public/properties/'.$bien->slug)->assertOk();

        $this->assertArrayHasKey('median_response_minutes', $reponse->json('data.agency'));
        $this->assertNull($reponse->json('data.agency.median_response_minutes'));
    }

    public function test_la_valeur_est_celle_de_la_fiche_publique_de_l_agence(): void
    {
        foreach (['agence-a' => 95, 'agence-b' => null] as $slug => $minutes) {
            $bien = $this->bienDeLAgence($slug, $minutes);

            $duBien = $this->getJson('/api/public/properties/'.$bien->slug)
                ->assertOk()->json('data.agency.median_response_minutes');
            $deLAgence = $this->getJson('/api/public/agencies/'.$slug)
                ->assertOk()->json('data.median_response_minutes');

            $this->assertSame($deLAgence, $duBien, $slug);
            $this->assertSame($minutes, $duBien, $slug);
        }
    }

    private function bienDeLAgence(string $slug, ?int $minutes): Property
    {
        $agence = Agency::factory()->create(['slug' => $slug, 'status' => AgencyStatus::Active]);
        // Le seul écrivain en production est `RefreshDirectoryResponseTimes`, par le constructeur de
        // requêtes : on pose la colonne de la même façon.
        Agency::query()->whereKey($agence->id)->toBase()->update(['median_response_minutes' => $minutes]);

        return Property::factory()->published()->create(['agency_id' => $agence->id]);
    }
}
