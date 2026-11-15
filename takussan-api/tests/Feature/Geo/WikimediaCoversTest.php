<?php

namespace Tests\Feature\Geo;

use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Services\Geo\WikimediaCovers;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FauxCommons;
use Tests\TestCase;

/**
 * TCK-2844 (ADR-0109 §2) — les propositions de Commons : seuls les fichiers dont
 * `AttributionRequired` vaut `"false"`, larges de 800 px au moins, dans l'ordre de la recherche.
 * Une panne rend une liste vide marquée `unavailable`, jamais une erreur.
 */
class WikimediaCoversTest extends TestCase
{
    use FauxCommons, RefreshDatabase;

    private GeoNeighborhood $mermoz;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $ville = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $this->mermoz = GeoNeighborhood::factory()->for($ville, 'city')->create(['name' => 'Mermoz', 'slug' => 'mermoz']);
    }

    /** AC3 — le premier rendu par la recherche exige l'attribution : il n'est pas proposé. */
    public function test_seuls_les_fichiers_libres_d_attribution_et_assez_larges_sont_proposes(): void
    {
        Http::fake(['commons.wikimedia.org/*' => Http::response($this->reponseCommons([
            $this->pageCommons('File:Petite.jpg', ['index' => 4, 'width' => 640]),
            $this->pageCommons('File:Libre B.jpg', ['index' => 3]),
            $this->pageCommons('File:Sans mention.jpg', ['index' => 5, 'attribution' => null]),
            $this->pageCommons('File:BY-SA.jpg', ['index' => 1, 'attribution' => 'true']),
            $this->pageCommons('File:Libre A.jpg', ['index' => 2, 'width' => 800, 'height' => 600]),
            ['ns' => 6, 'title' => 'File:Sans info.jpg', 'index' => 6],
        ]))]);

        $resultat = app(WikimediaCovers::class)->suggestions($this->mermoz);

        $this->assertFalse($resultat['unavailable']);
        $this->assertSame(['File:Libre A.jpg', 'File:Libre B.jpg'], array_column($resultat['items'], 'title'));
        $this->assertSame([
            'title' => 'File:Libre A.jpg',
            'thumb_url' => 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Libre_A.jpg/400px-Libre_A.jpg',
            'width' => 800,
            'height' => 600,
            'author' => 'Jean Dupont',
            'license' => 'CC0',
            'page_url' => 'https://commons.wikimedia.org/wiki/File:Libre_A.jpg',
        ], $resultat['items'][0]);

        Http::assertSent(function (Request $r) {
            $url = urldecode($r->url());

            return str_starts_with($url, 'https://commons.wikimedia.org/w/api.php?')
                && str_contains($url, 'generator=search')
                && str_contains($url, 'gsrnamespace=6')
                && str_contains($url, 'gsrsearch=Mermoz Dakar filetype:bitmap')
                && $r->hasHeader('User-Agent', config('services.wikimedia.user_agent'));
        });
    }

    public function test_une_recherche_sans_resultat_n_est_pas_une_panne(): void
    {
        Http::fake(['commons.wikimedia.org/*' => Http::response(['batchcomplete' => true])]);

        $this->assertSame(['items' => [], 'unavailable' => false], app(WikimediaCovers::class)->suggestions($this->mermoz));
    }

    /** @return array<string, array{Closure}> */
    public static function pannes(): array
    {
        return [
            'injoignable' => [fn () => throw new ConnectionException('timeout')],
            'erreur 503' => [fn () => Http::response('busy', 503)],
            'corps illisible' => [fn () => Http::response('<html>', 200)],
        ];
    }

    #[DataProvider('pannes')]
    public function test_commons_en_panne_rend_une_liste_vide_marquee_indisponible(Closure $panne): void
    {
        Http::fake(['commons.wikimedia.org/*' => $panne]);

        $this->assertSame(['items' => [], 'unavailable' => true], app(WikimediaCovers::class)->suggestions($this->mermoz));
    }

    /** La route : 200 même en panne, `meta.unavailable`. */
    public function test_la_route_des_propositions(): void
    {
        $this->actingAsRole('super_admin');
        Http::fake(['commons.wikimedia.org/*' => fn () => throw new ConnectionException('timeout')]);

        $this->getJson("/api/admin/geo/neighborhoods/{$this->mermoz->id}/cover/suggestions")
            ->assertOk()
            ->assertExactJson(['data' => [], 'meta' => ['unavailable' => true]]);
    }

    public function test_la_route_rend_les_propositions(): void
    {
        $this->actingAsRole('super_admin');
        Http::fake(['commons.wikimedia.org/*' => Http::response($this->reponseCommons([$this->pageCommons('File:Libre A.jpg')]))]);

        $this->getJson("/api/admin/geo/neighborhoods/{$this->mermoz->id}/cover/suggestions")
            ->assertOk()
            ->assertJsonPath('meta.unavailable', false)
            ->assertJsonPath('data.0.title', 'File:Libre A.jpg')
            ->assertJsonPath('data.0.license', 'CC0');
    }
}
