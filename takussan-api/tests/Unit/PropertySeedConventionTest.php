<?php

namespace Tests\Unit;

use App\Models\Enums\PropertyType;
use App\Models\Property;
use Database\Seeders\Support\SenegalFakerProvider;
use Tests\TestCase;

/**
 * TCK-506 — le jeu de démonstration respecte la convention que l'index porte.
 *
 * Deux défauts mesurés le 2026-09-02 sur la base locale, et corrigés ici :
 * les gabarits de titre écrivaient `F{bedrooms}` (F4 pour QUATRE chambres,
 * l'inverse de F(n) = chambres + 1), et la factory comme le seeder posaient
 * des chambres sur des terrains et des entrepôts (moyenne 3,2 sur `land`).
 */
class PropertySeedConventionTest extends TestCase
{
    public function test_un_titre_seede_fn_designe_n_moins_1_chambres(): void
    {
        $provider = new SenegalFakerProvider(fake());

        // 200 tirages : chaque gabarit d'appartement finit par sortir.
        $vus = 0;
        for ($i = 0; $i < 200; $i++) {
            $titre = $provider->senegalesePropertyTitle(PropertyType::Apartment, 3, 'Mermoz');
            if (preg_match('/\bF(\d+)\b/', $titre, $m)) {
                $vus++;
                $this->assertSame('4', $m[1], "« {$titre} » : F(n) doit valoir chambres + 1");
            }
            if (preg_match('/(\d+) pièces/', $titre, $m)) {
                $this->assertSame('4', $m[1], "« {$titre} » : les pièces comptent le salon");
            }
            if (preg_match('/(\d+) chambres/', $titre, $m)) {
                $this->assertSame('3', $m[1], "« {$titre} » : les chambres restent des chambres");
            }
        }

        $this->assertGreaterThan(0, $vus, 'aucun gabarit « F{n} » tiré en 200 essais');
    }

    public function test_la_factory_ne_pose_pas_de_chambres_hors_habitation(): void
    {
        foreach ([PropertyType::Land, PropertyType::Warehouse, PropertyType::Office, PropertyType::Shop,
            PropertyType::Garage, PropertyType::Parking, PropertyType::Factory] as $type) {
            $bien = Property::factory()->make(['type' => $type, 'user_id' => 1]);
            $this->assertNull($bien->bedrooms, "{$type->value} porte des chambres");
            $this->assertNull($bien->bathrooms, "{$type->value} porte des salles de bain");
        }

        foreach ([PropertyType::Apartment, PropertyType::House, PropertyType::Villa, PropertyType::Studio, PropertyType::Room] as $type) {
            $bien = Property::factory()->make(['type' => $type, 'user_id' => 1]);
            $this->assertNotNull($bien->bedrooms, "{$type->value} devrait avoir des chambres");
        }

        // Une valeur EXPLICITE prime : la fixture « terrain à 3 chambres » des
        // tests reste constructible.
        $this->assertSame(3, Property::factory()->make(['type' => PropertyType::Land, 'bedrooms' => 3, 'user_id' => 1])->bedrooms);
    }
}
