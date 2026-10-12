<?php

namespace Tests\Feature\Geo;

use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0062 §4) — un quartier ne se double pas dans sa ville, ni par la casse, ni par un
 * caractère accentué en capitale : « LIBERTÉ 4 » est « Liberté 4 ».
 *
 * ⚠ L'index replie la casse PAR ICU (ADR-0025). Un `LOWER(name)` nu, sous `--locale=C`, rend
 * `libertÉ 4` : il laisserait passer exactement le doublon que ce test interdit.
 *
 * Les accents, eux, ne se replient PAS (reconduction d'ADR-0020 §2) : « Liberte 4 » est un autre
 * nom. C'est la liste déroulante qui le rapproche à l'écran, pas la base.
 */
class GeoNeighborhoodUniquenessTest extends TestCase
{
    use RefreshDatabase;

    private GeoCity $ville;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ville = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Liberté 4', 'slug' => 'liberte-4']);
    }

    public function test_la_meme_ville_refuse_le_meme_nom_en_capitales_accentuees(): void
    {
        $this->expectException(UniqueConstraintViolationException::class);

        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'LIBERTÉ 4', 'slug' => 'liberte-4-bis']);
    }

    public function test_une_autre_ville_porte_le_meme_nom(): void
    {
        $autre = GeoCity::factory()->create(['name' => 'Thiès', 'slug' => 'thies']);

        $quartier = GeoNeighborhood::factory()->for($autre, 'city')->create(['name' => 'Liberté 4', 'slug' => 'liberte-4']);

        $this->assertTrue($quartier->exists);
    }

    public function test_les_accents_ne_sont_pas_replies(): void
    {
        $quartier = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Liberte 4', 'slug' => 'liberte-4-sans-accent']);

        $this->assertTrue($quartier->exists);
    }

    public function test_un_quartier_refuse_ou_fusionne_ne_reserve_plus_son_nom(): void
    {
        $refuse = GeoNeighborhood::factory()->for($this->ville, 'city')->rejected()->create(['name' => 'Fass', 'slug' => 'fass']);
        $cible = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Colobane', 'slug' => 'colobane']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->create([
            'name' => 'Gueule Tapée', 'slug' => 'gueule-tapee', 'merged_into_id' => $cible->id,
        ]);

        $fass = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'FASS', 'slug' => 'fass-2']);
        $gueule = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Gueule Tapée', 'slug' => 'gueule-tapee-2']);

        $this->assertSame(ReferentialStatus::Rejected, $refuse->refresh()->status);
        $this->assertTrue($fass->exists && $gueule->exists);
    }

    public function test_l_index_porte_la_collation_icu_et_sa_condition(): void
    {
        $definition = DB::selectOne(
            "SELECT indexdef FROM pg_indexes WHERE indexname = 'geo_neighborhoods_city_name_ci_unique'"
        )->indexdef;

        $this->assertStringContainsString('und-x-icu', $definition);
        $this->assertStringContainsString('merged_into_id IS NULL', $definition);
    }
}
