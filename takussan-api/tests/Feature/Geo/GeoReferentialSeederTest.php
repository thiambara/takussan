<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\GeoRegion;
use App\Models\Property;
use App\Models\User;
use Database\Seeders\System\GeoReferentialSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0062 §3) — le jeu de données se recharge SANS rien détruire : idempotent, il met à
 * jour les coordonnées, ajoute ce qui manque, ne supprime jamais, ne ressuscite ni un refusé ni un
 * fusionné, respecte un renommage décidé en modération, approuve la proposition que le jeu
 * confirme — puis rattache les adresses existantes qui nomment une ville connue.
 *
 * Il passe par la COMMANDE (`geo:sync-referential`) : c'est elle que le déploiement joue, la
 * production ne lançant aucun seeder (« Écarts relevés », E-2).
 */
class GeoReferentialSeederTest extends TestCase
{
    use RefreshDatabase;

    private const V1 = __DIR__.'/../../fixtures/geo/v1';

    private const V2 = __DIR__.'/../../fixtures/geo/v2';

    private function charger(string $repertoire): void
    {
        $this->artisan('geo:sync-referential', ['--dir' => $repertoire])->assertSuccessful();
    }

    private function quartier(string $slug): GeoNeighborhood
    {
        return GeoNeighborhood::query()->where('slug', $slug)->firstOrFail();
    }

    public function test_la_commande_charge_le_jeu(): void
    {
        $this->charger(self::V1);

        $this->assertSame(1, GeoRegion::query()->count());
        $this->assertSame(2, GeoCity::query()->count());
        $this->assertSame(6, GeoNeighborhood::query()->count());
        $this->assertSame('14.7074454', $this->quartier('mermoz')->latitude);
        $this->assertSame('n562878265', $this->quartier('mermoz')->osm_ref);
    }

    public function test_un_second_chargement_ne_change_rien(): void
    {
        $this->charger(self::V1);
        $avant = GeoNeighborhood::query()->orderBy('id')->get(['id', 'slug', 'name', 'latitude'])->toArray();

        $this->charger(self::V1);

        $this->assertSame($avant, GeoNeighborhood::query()->orderBy('id')->get(['id', 'slug', 'name', 'latitude'])->toArray());
    }

    public function test_une_nouvelle_version_met_a_jour_ajoute_et_ne_supprime_rien(): void
    {
        $this->charger(self::V1);
        $mermoz = $this->quartier('mermoz')->id;

        $this->charger(self::V2);

        $this->assertSame($mermoz, $this->quartier('mermoz')->id);
        $this->assertSame('14.7080000', $this->quartier('mermoz')->latitude);
        $this->assertSame('Liberté 5', $this->quartier('liberte-5')->name);
        $this->assertSame(ReferentialStatus::Approved, $this->quartier('sam-notaire')->status);
        $this->assertSame(7, GeoNeighborhood::query()->count());
    }

    public function test_un_quartier_refuse_ou_fusionne_n_est_pas_ressuscite(): void
    {
        $this->charger(self::V1);
        $this->quartier('point-e')->forceFill(['status' => ReferentialStatus::Rejected])->save();
        $this->quartier('golf-sud')->forceFill(['merged_into_id' => $this->quartier('sam-notaire')->id])->save();

        $this->charger(self::V2);

        $this->assertSame(ReferentialStatus::Rejected, $this->quartier('point-e')->status);
        $this->assertSame($this->quartier('sam-notaire')->id, $this->quartier('golf-sud')->merged_into_id);
    }

    public function test_un_renommage_de_moderation_l_emporte_sur_le_jeu(): void
    {
        $this->charger(self::V1);
        $this->quartier('mermoz')->forceFill(['name' => 'Mermoz Pyrotechnie', 'renamed_at' => now()])->save();

        $this->charger(self::V2);

        $this->assertSame('Mermoz Pyrotechnie', $this->quartier('mermoz')->name);
        $this->assertSame('14.7080000', $this->quartier('mermoz')->latitude);
    }

    public function test_le_jeu_approuve_la_proposition_qu_il_confirme(): void
    {
        $this->charger(self::V1);
        $auteur = User::factory()->create();
        $proposition = GeoNeighborhood::factory()
            ->for(GeoCity::query()->where('slug', 'dakar')->firstOrFail(), 'city')
            ->pending($auteur)
            ->create(['slug' => 'liberte-5', 'name' => 'LIBERTÉ 5']);

        $this->charger(self::V2);

        $relue = $proposition->refresh();
        $this->assertSame(ReferentialStatus::Approved, $relue->status);
        $this->assertSame('Liberté 5', $relue->name);
        $this->assertSame(7, GeoNeighborhood::query()->count());
    }

    public function test_les_adresses_existantes_se_rattachent_aux_noms_officiels(): void
    {
        $bien = Property::factory()->create();
        $adresse = Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'dakar',
            'region' => null,
            // `addresses.country` est NOT NULL, défaut `SN` (2026_04_17_160003) : pas de pays nul.
            'neighborhood' => 'POINT E',
        ]);
        $this->assertNull($adresse->refresh()->geo_city_id);

        $this->charger(self::V1);

        $relue = $adresse->refresh();
        $this->assertSame(GeoCity::query()->where('slug', 'dakar')->value('id'), $relue->geo_city_id);
        $this->assertSame($this->quartier('point-e')->id, $relue->geo_neighborhood_id);
        $this->assertSame('Dakar', $relue->city);
        $this->assertSame('Dakar', $relue->region);
        $this->assertSame('Point E', $relue->neighborhood);
        $this->assertSame('SN', $relue->country);
    }

    public function test_une_ville_ambigue_ne_se_rattache_que_par_sa_region(): void
    {
        $this->charger(self::V1);
        $autreRegion = GeoRegion::factory()->create(['code' => 'SN-TH', 'slug' => 'thies', 'name' => 'Thiès']);
        GeoCity::factory()->for($autreRegion, 'region')->create(['slug' => 'guediawaye', 'name' => 'Guédiawaye']);
        $bien = Property::factory()->create();
        $sansRegion = Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => $bien->id,
            'city' => 'Guédiawaye', 'region' => null, 'neighborhood' => null,
        ]);
        $avecRegion = Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => Property::factory()->create()->id,
            'city' => 'Guédiawaye', 'region' => 'dakar', 'neighborhood' => null,
        ]);

        $this->charger(self::V1);

        $this->assertNull($sansRegion->refresh()->geo_city_id);
        $this->assertSame(
            GeoCity::query()->whereHas('region', fn ($q) => $q->where('code', 'SN-DK'))->where('slug', 'guediawaye')->value('id'),
            $avecRegion->refresh()->geo_city_id,
        );
    }

    public function test_un_repertoire_vide_echoue_bruyamment(): void
    {
        $vide = sys_get_temp_dir().'/geo-vide-'.uniqid();
        mkdir($vide);

        $this->artisan('geo:sync-referential', ['--dir' => $vide])->assertFailed();

        rmdir($vide);
    }

    public function test_le_seeder_charge_les_quatorze_regions_versionnees(): void
    {
        $this->seed(GeoReferentialSeeder::class);

        $this->assertSame(14, GeoRegion::query()->count());
        $this->assertGreaterThan(14, GeoCity::query()->count());
    }
}
