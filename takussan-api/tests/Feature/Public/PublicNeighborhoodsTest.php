<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-618 (contrainte 2) — un quartier n'est compté qu'une fois : le regroupement ignore les espaces
 * de bord, et la graphie rendue est la plus fréquente, puis une graphie non capitale à égalité.
 */
class PublicNeighborhoodsTest extends TestCase
{
    use RefreshDatabase;

    private function bienA(string $quartier, string $ville = 'Dakar'): void
    {
        $property = Property::factory()->published()->create();
        Address::factory()->create([
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'city' => $ville,
            'neighborhood' => $quartier,
        ]);
    }

    public function test_les_espaces_de_bord_ne_fractionnent_pas_le_compte(): void
    {
        foreach (range(1, 4) as $_) {
            $this->bienA('Mermoz');
        }
        $this->bienA(' Mermoz ');

        $this->getJson('/api/public/properties/neighborhoods?city=Dakar')
            ->assertOk()
            ->assertExactJson([
                'data' => [['value' => 'Mermoz', 'count' => 5, 'photo' => null]],
                'meta' => ['truncated' => false],
            ]);
    }

    public function test_a_egalite_la_graphie_non_capitale_l_emporte(): void
    {
        $this->bienA('Médina');
        $this->bienA('Médina');
        $this->bienA('MÉDINA');
        $this->bienA('MÉDINA');

        $this->getJson('/api/public/properties/neighborhoods?city=Dakar')
            ->assertOk()
            ->assertExactJson([
                'data' => [['value' => 'Médina', 'count' => 4, 'photo' => null]],
                'meta' => ['truncated' => false],
            ]);
    }

    public function test_la_graphie_la_plus_frequente_l_emporte_meme_capitale(): void
    {
        $this->bienA('MÉDINA');
        $this->bienA('MÉDINA');
        $this->bienA('Médina');

        $this->getJson('/api/public/properties/neighborhoods?city=Dakar')
            ->assertOk()
            ->assertJsonPath('data.0.value', 'MÉDINA')
            ->assertJsonPath('data.0.count', 3);
    }
}
