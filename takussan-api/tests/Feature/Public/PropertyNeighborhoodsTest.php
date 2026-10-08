<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-598 (V14, contrainte 12) — `GET /api/public/properties/neighborhoods?city=…` : le DOMAINE de
 * la clé canonique `location`, jumeau de `cities` borné par ville.
 */
class PropertyNeighborhoodsTest extends TestCase
{
    use RefreshDatabase;

    private function bienA(string $ville, ?string $quartier, array $attributs = []): Property
    {
        $property = Property::factory()->published()->create($attributs);
        Address::factory()->create([
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'city' => $ville,
            'neighborhood' => $quartier,
        ]);

        return $property;
    }

    /** AC11 — « Mermoz » et « MERMOZ » : une entrée, comptée deux ; la graphie la plus fréquente. */
    public function test_les_variantes_de_casse_se_fondent(): void
    {
        $this->bienA('Dakar', 'Mermoz');
        $this->bienA('Dakar', 'Mermoz');
        $this->bienA('Dakar', 'MERMOZ');
        $this->bienA('Dakar', 'Médina');
        $this->bienA('Dakar', 'MÉDINA');
        $this->bienA('Thiès', 'Mermoz');

        $reponse = $this->getJson('/api/public/properties/neighborhoods?city=Dakar')
            ->assertOk()
            ->assertJsonPath('meta.truncated', false);

        $this->assertSame(
            [['value' => 'Mermoz', 'count' => 3], ['value' => 'MÉDINA', 'count' => 2]],
            $reponse->json('data'),
        );
    }

    /** La ville se compare comme le quartier : `dakar` désigne Dakar. */
    public function test_la_ville_est_comparee_sans_la_casse(): void
    {
        $this->bienA('Dakar', 'Mermoz');

        $this->getJson('/api/public/properties/neighborhoods?city=dakar')
            ->assertOk()
            ->assertJsonPath('data.0.value', 'Mermoz');
    }

    /** AC11 — une ville inconnue rend `data: []` ; sans ville, 422. */
    public function test_une_ville_inconnue_rend_un_domaine_vide(): void
    {
        $this->bienA('Dakar', 'Mermoz');

        $this->getJson('/api/public/properties/neighborhoods?city=Inventee')
            ->assertOk()
            ->assertExactJson(['data' => [], 'meta' => ['truncated' => false]]);

        $this->getJson('/api/public/properties/neighborhoods')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['city']);
    }

    /** Seuls les biens que `->public()` laisse atteindre entrent ; un quartier vide n'entre pas. */
    public function test_seuls_les_biens_publics_comptent(): void
    {
        $this->bienA('Dakar', 'Mermoz');
        $this->bienA('Dakar', 'Almadies', ['visibility' => PropertyVisibility::Private]);
        $this->bienA('Dakar', 'Ouakam', ['is_test' => true]);
        $this->bienA('Dakar', '  ');
        $this->bienA('Dakar', null);

        $this->assertSame(
            [['value' => 'Mermoz', 'count' => 1]],
            $this->getJson('/api/public/properties/neighborhoods?city=Dakar')->assertOk()->json('data'),
        );
    }

    /** Le plafond : un domaine tronqué le dit. */
    public function test_au_dela_du_plafond_le_domaine_se_dit_tronque(): void
    {
        config(['catalogue.neighborhoods_max' => 2]);
        $this->bienA('Dakar', 'Mermoz');
        $this->bienA('Dakar', 'Ouakam');
        $this->bienA('Dakar', 'Yoff');

        $reponse = $this->getJson('/api/public/properties/neighborhoods?city=Dakar')->assertOk();

        $reponse->assertJsonPath('meta.truncated', true)->assertJsonCount(2, 'data');
    }
}
