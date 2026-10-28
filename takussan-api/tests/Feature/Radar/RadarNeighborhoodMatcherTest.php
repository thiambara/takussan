<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\User;
use App\Services\Radar\RadarNeighborhoodMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * TCK-2386 (ADR-0077 §5, ADR-0062, AC5) — le quartier d'une annonce rapproché du référentiel par
 * du code, jamais par l'IA : un seul quartier de même clé est rattaché, sinon des suggestions —
 * jamais un choix.
 */
class RadarNeighborhoodMatcherTest extends TestCase
{
    use RefreshDatabase;

    private RadarNeighborhoodMatcher $matcher;

    protected function setUp(): void
    {
        parent::setUp();
        $this->matcher = app(RadarNeighborhoodMatcher::class);
    }

    private function city(string $name): GeoCity
    {
        return GeoCity::factory()->create(['name' => $name, 'slug' => Str::slug($name).'-'.Str::random(4)]);
    }

    /** @param  array<string, mixed>  $state */
    private function quartier(GeoCity $city, string $name, array $state = []): GeoNeighborhood
    {
        return GeoNeighborhood::factory()->create([
            'geo_city_id' => $city->id, 'name' => $name, 'slug' => Str::slug($name).'-'.Str::random(4),
        ] + $state);
    }

    public function test_un_seul_quartier_de_meme_cle_est_rattache(): void
    {
        $dakar = $this->city('Dakar');
        $liberte6 = $this->quartier($dakar, 'Liberté 6');
        $this->quartier($dakar, 'Liberté 5');

        $this->assertSame(['neighborhood_id' => $liberte6->id, 'suggestions' => []], $this->matcher->match('Liberté 6', 'Dakar'));
        // Casse, tirets et blancs repliés (clé de GeoNeighborhoodResolver::cle()) ; ville inconnue : non bornée.
        $this->assertSame($liberte6->id, $this->matcher->match('  LIBERTÉ-6 ', null)['neighborhood_id']);
        $this->assertSame($liberte6->id, $this->matcher->match('Liberté 6', 'Ville inexistante')['neighborhood_id']);
    }

    public function test_un_nom_partiel_rend_au_plus_cinq_suggestions_et_jamais_un_choix(): void
    {
        $dakar = $this->city('Dakar');
        foreach ([6, 2, 4, 1, 5, 3] as $n) {
            $this->quartier($dakar, "Liberté {$n}");
        }
        $this->quartier($dakar, 'Ouakam');

        $result = $this->matcher->match('Liberté', 'Dakar');

        $this->assertNull($result['neighborhood_id']);
        $this->assertSame(
            ['Liberté 1', 'Liberté 2', 'Liberté 3', 'Liberté 4', 'Liberté 5'],
            array_column($result['suggestions'], 'name'),
        );
        $this->assertSame('Dakar', $result['suggestions'][0]['city']);
        $this->assertIsInt($result['suggestions'][0]['id']);
    }

    public function test_le_meme_nom_dans_deux_villes_rend_des_suggestions(): void
    {
        $thies = $this->city('Thiès');
        $mbour = $this->city('Mbour');
        $a = $this->quartier($thies, 'Grand Standing');
        $b = $this->quartier($mbour, 'Grand Standing');

        $result = $this->matcher->match('Grand Standing', null);

        $this->assertNull($result['neighborhood_id']);
        $this->assertEqualsCanonicalizing(
            [['id' => $a->id, 'name' => 'Grand Standing', 'city' => 'Thiès'], ['id' => $b->id, 'name' => 'Grand Standing', 'city' => 'Mbour']],
            $result['suggestions'],
        );

        // La ville connue borne la recherche : le doublon de l'autre ville ne compte plus.
        $this->assertSame($b->id, $this->matcher->match('Grand Standing', 'MBOUR')['neighborhood_id']);
    }

    public function test_un_quartier_fusionne_rend_sa_cible(): void
    {
        $dakar = $this->city('Dakar');
        $cible = $this->quartier($dakar, 'Sicap Liberté');
        $this->quartier($dakar, 'Sicap-Liberte', ['merged_into_id' => $cible->id]);

        $this->assertSame($cible->id, $this->matcher->match('Sicap-Liberte', 'Dakar')['neighborhood_id']);
    }

    public function test_un_quartier_refuse_ou_en_attente_n_est_ni_rattache_ni_suggere(): void
    {
        $dakar = $this->city('Dakar');
        $this->quartier($dakar, 'Ouakam Plage')->update(['status' => ReferentialStatus::Rejected]);
        $this->quartier($dakar, 'Ouakam Village', ['status' => ReferentialStatus::Pending, 'created_by_id' => User::factory()->create()->id]);

        $this->assertSame(['neighborhood_id' => null, 'suggestions' => []], $this->matcher->match('Ouakam Plage', 'Dakar'));
        $this->assertSame(['neighborhood_id' => null, 'suggestions' => []], $this->matcher->match('Ouakam Village', 'Dakar'));
        $this->assertSame(['neighborhood_id' => null, 'suggestions' => []], $this->matcher->match('Ouakam', 'Dakar'));
    }

    public function test_les_accents_restent_distincts_le_nom_sans_accent_est_une_suggestion(): void
    {
        $dakar = $this->city('Dakar');
        $liberte6 = $this->quartier($dakar, 'Liberté 6');

        $result = $this->matcher->match('Liberte 6', 'Dakar');

        // ADR-0062 §1 : « Liberte 6 » n'est pas « Liberté 6 » pour un rattachement — l'humain tranche.
        $this->assertNull($result['neighborhood_id']);
        $this->assertSame([['id' => $liberte6->id, 'name' => 'Liberté 6', 'city' => 'Dakar']], $result['suggestions']);
    }

    public function test_un_texte_qui_contient_le_nom_le_suggere(): void
    {
        $dakar = $this->city('Dakar');
        $mermoz = $this->quartier($dakar, 'Mermoz');

        $result = $this->matcher->match('Mermoz Pyrotechnie', 'Dakar');

        $this->assertNull($result['neighborhood_id']);
        $this->assertSame([$mermoz->id], array_column($result['suggestions'], 'id'));
    }

    public function test_l_inclusion_demande_une_cle_d_au_moins_trois_caracteres(): void
    {
        $dakar = $this->city('Dakar');
        $this->quartier($dakar, 'Liberté 1');
        $this->quartier($dakar, 'Fa');

        // « rt » est dans « Liberté 1 », « Fa » dans « Rue Fa Mermoz » : trop court pour suggérer.
        $this->assertSame([], $this->matcher->match('rt', 'Dakar')['suggestions']);
        $this->assertSame([], $this->matcher->match('Rue Fa Mermoz', 'Dakar')['suggestions']);
        // Le préfixe reste permis à deux caractères.
        $this->assertSame(['Liberté 1'], array_column($this->matcher->match('Li', 'Dakar')['suggestions'], 'name'));
    }

    public function test_un_texte_vide_ne_rend_rien(): void
    {
        $this->quartier($this->city('Dakar'), 'Liberté 6');

        $this->assertSame(['neighborhood_id' => null, 'suggestions' => []], $this->matcher->match('  ', 'Dakar'));
        $this->assertSame(['neighborhood_id' => null, 'suggestions' => []], $this->matcher->match('-', null));
    }
}
