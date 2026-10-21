<?php

namespace Tests\Feature\Geo;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1119 (P87.03) — un même catalogue sort dans l'ordre que le site public lui donne déjà
 * (`GeoReferentialController::TRI`, `COLLATE "und-x-icu"`), sur l'API connectée et dans la console.
 *
 * Sous `--locale=C`, l'ordre des octets rangeait « étage », « Étranger » et « Île Nord » après « Z ».
 */
class CatalogueCollatedSortTest extends TestCase
{
    use RefreshDatabase;

    private const ETIQUETTES = ['Zinc', 'étage', 'Étranger', 'Balcon'];

    private const ORDRE_ETIQUETTES = ['Balcon', 'étage', 'Étranger', 'Zinc'];

    private function etiquettes(ReferentialStatus $statut): void
    {
        foreach (self::ETIQUETTES as $nom) {
            Tag::factory()->create([
                'name' => $nom,
                'slug' => Str::slug($nom).'-'.Str::random(4),
                'type' => TagType::Amenity,
                'status' => $statut,
            ]);
        }
    }

    /** @param  list<string>  $noms */
    private function seulement(array $noms, array $parmi): array
    {
        return array_values(array_filter($noms, fn (string $n) => in_array($n, $parmi, true)));
    }

    public function test_les_etiquettes_de_l_api_connectee_sont_rangees_dans_l_ordre_icu(): void
    {
        $this->etiquettes(ReferentialStatus::Approved);
        Sanctum::actingAs(User::factory()->create());

        foreach (['' => self::ORDRE_ETIQUETTES, '&sort=name' => self::ORDRE_ETIQUETTES, '&sort=-name' => array_reverse(self::ORDRE_ETIQUETTES)] as $tri => $attendu) {
            $noms = $this->getJson("/api/tags?per_page=100{$tri}")->assertOk()->json('data.*.name');

            $this->assertSame($attendu, $this->seulement($noms, self::ETIQUETTES), "tri « {$tri} »");
        }
    }

    public function test_les_etiquettes_de_la_console_se_trient_par_nom_dans_l_ordre_icu(): void
    {
        $this->etiquettes(ReferentialStatus::Pending);
        $this->actingAsRole('super_admin');

        $noms = $this->getJson('/api/admin/tags/proposals?sort=name&per_page=100')->assertOk()->json('data.*.name');

        $this->assertSame(self::ORDRE_ETIQUETTES, $this->seulement($noms, self::ETIQUETTES));
    }

    public function test_les_quartiers_de_la_console_se_trient_par_nom_dans_l_ordre_icu(): void
    {
        $ville = GeoCity::factory()->create();
        foreach (['Zone B', 'Île Nord', 'Almadies'] as $nom) {
            GeoNeighborhood::factory()->for($ville, 'city')->create(['name' => $nom, 'slug' => Str::slug($nom)]);
        }
        $this->actingAsRole('super_admin');

        $noms = $this->getJson('/api/admin/geo/neighborhoods?sort=name&per_page=100')->assertOk()->json('data.*.name');

        $this->assertSame(['Almadies', 'Île Nord', 'Zone B'], $this->seulement($noms, ['Zone B', 'Île Nord', 'Almadies']));
    }

    /**
     * Les quartiers approuvés proches d'une proposition. « Ile-Nord » et « ile nord » ont la même clé
     * repliée (le tiret est un séparateur) : l'ordre des octets met la majuscule d'abord
     * (0x49 < 0x69), l'ordre ICU l'espace avant le tiret.
     */
    public function test_les_quartiers_proches_d_une_proposition_sont_ranges_dans_l_ordre_icu(): void
    {
        $ville = GeoCity::factory()->create();
        GeoNeighborhood::factory()->for($ville, 'city')->create(['name' => 'Ile-Nord', 'slug' => 'ile-nord-a']);
        GeoNeighborhood::factory()->for($ville, 'city')->create(['name' => 'ile nord', 'slug' => 'ile-nord-b']);
        GeoNeighborhood::factory()->for($ville, 'city')->pending(User::factory()->create())->create(['name' => 'Île Nord', 'slug' => 'ile-nord-c']);
        $this->actingAsRole('super_admin');

        $proches = $this->getJson('/api/admin/geo/neighborhoods?filter[status]=pending')
            ->assertOk()
            ->json('data.0.similar.*.name');

        $this->assertSame(['ile nord', 'Ile-Nord'], $proches);
    }
}
