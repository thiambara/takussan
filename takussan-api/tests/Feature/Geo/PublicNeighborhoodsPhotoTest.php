<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-2844 (ADR-0109 §3) — `GET /api/public/properties/neighborhoods` rend `photo` par ligne :
 * l'URL de la conversion `display` du quartier du RÉFÉRENTIEL (même ville, nom replié, approuvé,
 * non fusionné), ou `null`. Une URL seule : ni auteur, ni licence, ni page source (AC6).
 */
class PublicNeighborhoodsPhotoTest extends TestCase
{
    use RefreshDatabase;

    private GeoCity $dakar;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dakar = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
    }

    private function bienA(string $ville, string $quartier): void
    {
        $bien = Property::factory()->published()->create();
        Address::factory()->create([
            'addressable_id' => $bien->id,
            'addressable_type' => Property::class,
            'city' => $ville,
            'neighborhood' => $quartier,
        ]);
    }

    private function quartier(GeoCity $ville, string $nom, array $attributs = []): GeoNeighborhood
    {
        return GeoNeighborhood::factory()->for($ville, 'city')->create(['name' => $nom, 'slug' => str($nom)->slug().'-'.$ville->id] + $attributs);
    }

    private function avecPhoto(GeoNeighborhood $q, array $provenance = ['source' => 'upload']): GeoNeighborhood
    {
        $q->addMedia(UploadedFile::fake()->image('p.jpg', 900, 900))
            ->withCustomProperties($provenance)
            ->toMediaCollection('cover');

        return $q;
    }

    /** AC1 — après l'envoi du super-admin, la ligne du quartier porte `photo` ; les autres `null`. */
    public function test_la_photo_envoyee_se_lit_sur_l_accueil(): void
    {
        $mermoz = $this->quartier($this->dakar, 'Mermoz');
        $this->quartier($this->dakar, 'Ouakam');
        $this->bienA('Dakar', 'Mermoz');
        $this->bienA('Dakar', 'Mermoz');
        $this->bienA('Dakar', 'Ouakam');

        $this->actingAsRole('super_admin');
        $this->post("/api/admin/geo/neighborhoods/{$mermoz->id}/cover", ['file' => UploadedFile::fake()->image('m.jpg', 1600, 1000)], ['Accept' => 'application/json'])->assertOk();

        $data = $this->getJson('/api/public/properties/neighborhoods?city=Dakar')->assertOk()->json('data');

        $this->assertSame('Mermoz', $data[0]['value']);
        $this->assertSame($mermoz->refresh()->cover_url, $data[0]['photo']);
        $this->assertStringContainsString('-display.webp', $data[0]['photo']);
        $this->assertSame(['value' => 'Ouakam', 'count' => 1, 'photo' => null], $data[1]);
    }

    /** Le rapprochement replie la casse, comme le domaine lui-même (`MERMOZ` = `Mermoz`). */
    public function test_le_rapprochement_replie_la_casse_du_quartier_et_de_la_ville(): void
    {
        $this->avecPhoto($this->quartier($this->dakar, 'Médina'));
        $this->bienA('dakar', 'MÉDINA');

        $data = $this->getJson('/api/public/properties/neighborhoods?city=DAKAR')->assertOk()->json('data');

        $this->assertNotNull($data[0]['photo']);
    }

    /** Ni un quartier d'une autre ville, ni un refusé, ni un fusionné ne prêtent leur photo. */
    public function test_seul_le_quartier_approuve_non_fusionne_de_la_ville_compte(): void
    {
        $thies = GeoCity::factory()->create(['slug' => 'thies', 'name' => 'Thiès']);
        $this->avecPhoto($this->quartier($thies, 'Mermoz'));
        $cible = $this->quartier($this->dakar, 'Point E');
        $this->avecPhoto($this->quartier($this->dakar, 'Ouakam', ['merged_into_id' => $cible->id]));
        $this->avecPhoto($this->quartier($this->dakar, 'Yoff', ['status' => 'rejected']));
        $this->bienA('Dakar', 'Mermoz');
        $this->bienA('Dakar', 'Ouakam');
        $this->bienA('Dakar', 'Yoff');
        $this->bienA('Dakar', 'Inconnu');

        $data = $this->getJson('/api/public/properties/neighborhoods?city=Dakar')->assertOk()->json('data');

        $this->assertCount(4, $data);
        $this->assertSame([null], array_values(array_unique(array_column($data, 'photo'))));
    }

    /** AC6 — aucune clé de provenance ne sort : la ligne est `value`, `count`, `photo`, et rien d'autre. */
    public function test_aucune_provenance_ne_sort(): void
    {
        $this->avecPhoto($this->quartier($this->dakar, 'Mermoz'), [
            'source' => 'wikimedia',
            'source_url' => 'https://commons.wikimedia.org/wiki/File:Secret.jpg',
            'author' => 'Auteur Secret',
            'license' => 'Licence Secrète',
        ]);
        $this->bienA('Dakar', 'Mermoz');

        $reponse = $this->getJson('/api/public/properties/neighborhoods?city=Dakar')->assertOk();

        $this->assertSame(['value', 'count', 'photo'], array_keys($reponse->json('data.0')));
        $corps = $reponse->getContent();
        foreach (['Secret', 'commons.wikimedia.org', 'wikimedia', 'Licence'] as $fuite) {
            $this->assertStringNotContainsString($fuite, (string) $corps);
        }
    }

    /** Une requête pour toutes les lignes, jamais une par ligne. */
    public function test_le_nombre_de_requetes_ne_croit_pas_avec_les_lignes(): void
    {
        $compter = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/public/properties/neighborhoods?city=Dakar')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $this->avecPhoto($this->quartier($this->dakar, 'Q1'));
        $this->bienA('Dakar', 'Q1');
        $une = $compter();

        foreach (['Q2', 'Q3', 'Q4', 'Q5'] as $nom) {
            $this->avecPhoto($this->quartier($this->dakar, $nom));
            $this->bienA('Dakar', $nom);
        }
        $cinq = $compter();

        $this->assertSame($une, $cinq);
    }
}
