<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FauxCommons;
use Tests\TestCase;

/**
 * TCK-2844 (ADR-0109) — la photo d'un quartier : posée par le super-admin seul, sur un quartier
 * approuvé et non fusionné, par un envoi ou par l'import d'un fichier de Commons NOMMÉ PAR SON
 * TITRE. Commons est toujours simulé, et toute requête non prévue fait échouer le test.
 */
class GeoNeighborhoodCoverTest extends TestCase
{
    use FauxCommons, RefreshDatabase;

    private GeoCity $ville;

    private GeoNeighborhood $mermoz;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->ville = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $this->mermoz = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Mermoz', 'slug' => 'mermoz']);
    }

    private function url(GeoNeighborhood $q, string $suite = ''): string
    {
        return "/api/admin/geo/neighborhoods/{$q->id}/cover{$suite}";
    }

    /**
     * Commons rend `$page` pour une lecture par titre, et `$octets` pour tout téléchargement sur
     * `thumb.wikimedia.org` ou `upload.wikimedia.org`.
     *
     * @param  array<string, mixed>  $page
     */
    private function commonsRend(array $page, ?string $octets = null): void
    {
        Http::fake([
            'commons.wikimedia.org/*' => Http::response($this->reponseCommons([$page])),
            'thumb.wikimedia.org/*' => Http::response($octets ?? $this->octetsJpeg(), 200, ['Content-Type' => 'image/jpeg']),
            'upload.wikimedia.org/*' => Http::response($octets ?? $this->octetsJpeg(), 200, ['Content-Type' => 'image/jpeg']),
        ]);
    }

    public function test_le_super_admin_envoie_une_photo_et_la_ligne_la_porte(): void
    {
        $this->actingAsRole('super_admin');

        $this->post($this->url($this->mermoz), ['file' => UploadedFile::fake()->image('mermoz.jpg', 1800, 1200)], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.id', $this->mermoz->id)
            ->assertJsonPath('data.cover.source', 'upload');

        $media = $this->mermoz->refresh()->getFirstMedia('cover');
        $this->assertNotNull($media);
        $this->assertSame('upload', $media->getCustomProperty('source'));
        $this->assertTrue($media->hasGeneratedConversion('display'));
        Storage::disk(config('media-library.public_disk_name'))->assertExists($media->getPathRelativeToRoot('display'));
        $this->assertStringContainsString('display', (string) $this->mermoz->cover_url);
        $this->assertStringContainsString('-display.webp', (string) $this->mermoz->cover_url);
    }

    public function test_un_second_envoi_remplace_le_premier(): void
    {
        $this->actingAsRole('super_admin');
        $this->post($this->url($this->mermoz), ['file' => UploadedFile::fake()->image('a.jpg', 900, 900)], ['Accept' => 'application/json'])->assertOk();
        $this->post($this->url($this->mermoz), ['file' => UploadedFile::fake()->image('b.png', 900, 900)], ['Accept' => 'application/json'])->assertOk();

        $this->assertCount(1, $this->mermoz->refresh()->getMedia('cover'));
    }

    public function test_retirer_la_photo(): void
    {
        $this->actingAsRole('super_admin');
        $this->post($this->url($this->mermoz), ['file' => UploadedFile::fake()->image('a.jpg', 900, 900)], ['Accept' => 'application/json'])->assertOk();

        $this->deleteJson($this->url($this->mermoz))->assertNoContent();

        $this->assertCount(0, $this->mermoz->refresh()->getMedia('cover'));
        $this->assertNull($this->mermoz->cover_url);
    }

    /** AC2 — les quatre routes `cover`, refusées à qui n'est pas super-admin. */
    public function test_un_non_super_admin_recoit_403_sur_les_quatre_routes(): void
    {
        $this->actingAsRole('agent');

        $this->getJson($this->url($this->mermoz, '/suggestions'))->assertForbidden();
        $this->post($this->url($this->mermoz), ['file' => UploadedFile::fake()->image('a.jpg', 900, 900)], ['Accept' => 'application/json'])->assertForbidden();
        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'wikimedia', 'title' => 'File:Mermoz.jpg'])->assertForbidden();
        $this->deleteJson($this->url($this->mermoz))->assertForbidden();

        $this->assertCount(0, $this->mermoz->refresh()->getMedia('cover'));
        Http::assertNothingSent();
    }

    /** AC2 — un quartier en attente, refusé ou fusionné : 422 `geo_cover.not_approved`, rien d'écrit. */
    public function test_un_quartier_non_approuve_ne_recoit_pas_de_photo(): void
    {
        $this->actingAsRole('super_admin');
        $enAttente = GeoNeighborhood::factory()->for($this->ville, 'city')->pending(User::factory()->create())->create(['name' => 'Cité X', 'slug' => 'cite-x']);
        $refuse = GeoNeighborhood::factory()->for($this->ville, 'city')->rejected()->create(['name' => 'Cité Y', 'slug' => 'cite-y']);
        $fusionne = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Mermos', 'slug' => 'mermos', 'merged_into_id' => $this->mermoz->id]);

        foreach ([$enAttente, $refuse, $fusionne] as $q) {
            $this->post($this->url($q), ['file' => UploadedFile::fake()->image('a.jpg', 900, 900)], ['Accept' => 'application/json'])
                ->assertStatus(422)
                ->assertJsonPath('code', 'geo_cover.not_approved');
            $this->postJson($this->url($q, '/import'), ['source' => 'wikimedia', 'title' => 'File:Mermoz.jpg'])
                ->assertStatus(422)
                ->assertJsonPath('code', 'geo_cover.not_approved');
            $this->getJson($this->url($q, '/suggestions'))
                ->assertStatus(422)
                ->assertJsonPath('code', 'geo_cover.not_approved');
            $this->assertCount(0, $q->refresh()->getMedia('cover'));
        }
        Http::assertNothingSent();
    }

    public function test_un_fichier_qui_n_est_pas_une_image_admise_est_refuse(): void
    {
        $this->actingAsRole('super_admin');

        $this->post($this->url($this->mermoz), ['file' => UploadedFile::fake()->create('plan.pdf', 100, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('file');
        $this->post($this->url($this->mermoz), ['file' => UploadedFile::fake()->image('anim.gif', 900, 900)], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('file');
        $this->post($this->url($this->mermoz), ['file' => UploadedFile::fake()->image('lourde.jpg', 900, 900)->size(10_241)], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('file');

        $this->assertCount(0, $this->mermoz->refresh()->getMedia('cover'));
    }

    public function test_l_import_d_un_fichier_libre_le_telecharge_et_garde_sa_provenance(): void
    {
        $this->actingAsRole('super_admin');
        $this->commonsRend($this->pageCommons('File:Mermoz Dakar.jpg'));

        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'wikimedia', 'title' => 'File:Mermoz Dakar.jpg'])
            ->assertOk()
            ->assertJsonPath('data.cover.source', 'wikimedia');

        $media = $this->mermoz->refresh()->getFirstMedia('cover');
        $this->assertNotNull($media);
        $this->assertSame('wikimedia', $media->getCustomProperty('source'));
        $this->assertSame('https://commons.wikimedia.org/wiki/File:Mermoz_Dakar.jpg', $media->getCustomProperty('source_url'));
        $this->assertSame('Jean Dupont', $media->getCustomProperty('author'));
        $this->assertSame('CC0', $media->getCustomProperty('license'));
        $this->assertTrue($media->hasGeneratedConversion('display'));

        // Commons est appelé avec un User-Agent qui nomme l'application, et rien d'autre.
        Http::assertSent(fn (Request $r) => str_starts_with($r->url(), 'https://commons.wikimedia.org/w/api.php')
            && $r->hasHeader('User-Agent', config('services.wikimedia.user_agent'))
            && str_contains(urldecode($r->url()), 'titles=File:Mermoz Dakar.jpg'));
        Http::assertSent(fn (Request $r) => str_starts_with($r->url(), 'https://thumb.wikimedia.org/wikipedia/commons/thumb/'));
    }

    /** @return array<string, array{string}> */
    public static function urlsDeTelechargementAdmises(): array
    {
        return [
            // Relevés sur le vrai Commons le 2026-11-15.
            'vignette sur thumb' => ['https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7f/PointeAlmadies.jpg/1920px-PointeAlmadies.jpg'],
            'original plus étroit, sur upload' => ['https://upload.wikimedia.org/wikipedia/commons/7/7f/Petite.jpg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original'],
        ];
    }

    #[DataProvider('urlsDeTelechargementAdmises')]
    public function test_l_import_telecharge_depuis_les_deux_hotes_de_wikimedia(string $url): void
    {
        $this->actingAsRole('super_admin');
        $this->commonsRend($this->pageCommons('File:Mermoz Dakar.jpg', ['thumburl' => $url]));

        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'wikimedia', 'title' => 'File:Mermoz Dakar.jpg'])->assertOk();

        Http::assertSent(fn (Request $r) => $r->url() === $url);
        $this->assertCount(1, $this->mermoz->refresh()->getMedia('cover'));
    }

    /** Un import est réencodé comme un envoi : l'original rangé n'a plus d'EXIF. */
    public function test_l_import_range_un_fichier_reencode_sans_exif(): void
    {
        $this->actingAsRole('super_admin');
        $this->commonsRend($this->pageCommons('File:Mermoz Dakar.jpg'), $this->octetsJpegAvecExif('MARQUEUR-GPS'));

        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'wikimedia', 'title' => 'File:Mermoz Dakar.jpg'])->assertOk();

        $media = $this->mermoz->refresh()->getFirstMedia('cover');
        $this->assertNotNull($media);
        $this->assertSame('mermoz-dakar.jpg', $media->file_name);
        $range = (string) Storage::disk($media->disk)->get($media->getPathRelativeToRoot());
        $this->assertNotSame('', $range);
        $this->assertStringNotContainsString('MARQUEUR-GPS', $range);
        $this->assertStringNotContainsString('Exif', $range);
    }

    /** AC4 — une licence qui exige désormais l'attribution : 422, et RIEN n'est téléchargé. */
    public function test_l_import_est_refuse_quand_commons_exige_l_attribution(): void
    {
        $this->actingAsRole('super_admin');
        $this->commonsRend($this->pageCommons('File:Mermoz Dakar.jpg', ['attribution' => 'true']));

        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'wikimedia', 'title' => 'File:Mermoz Dakar.jpg'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'geo_cover.attribution_required');

        Http::assertSentCount(1);
        Http::assertNotSent(fn (Request $r) => ! str_starts_with($r->url(), 'https://commons.wikimedia.org/'));
        $this->assertCount(0, $this->mermoz->refresh()->getMedia('cover'));
    }

    /** Sans la mention, l'attribution est présumée exigée. */
    public function test_l_import_est_refuse_quand_commons_ne_dit_rien_de_l_attribution(): void
    {
        $this->actingAsRole('super_admin');
        $this->commonsRend($this->pageCommons('File:Mermoz Dakar.jpg', ['attribution' => null]));

        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'wikimedia', 'title' => 'File:Mermoz Dakar.jpg'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'geo_cover.attribution_required');
        Http::assertSentCount(1);
    }

    /** @return array<string, array{string}> */
    public static function urlsHorsDUploadWikimedia(): array
    {
        return [
            'autre hôte' => ['https://evil.example/x.jpg'],
            'http' => ['http://upload.wikimedia.org/x.jpg'],
            'port' => ['https://upload.wikimedia.org:8443/x.jpg'],
            'suffixe' => ['https://upload.wikimedia.org.evil.example/x.jpg'],
            'identifiants' => ['https://user@upload.wikimedia.org/x.jpg'],
            'thumb en http' => ['http://thumb.wikimedia.org/x.jpg'],
            'suffixe de thumb' => ['https://thumb.wikimedia.org.evil.example/x.jpg'],
            'sous-domaine de thumb' => ['https://evil.thumb.wikimedia.org/x.jpg'],
            'commons lui-même' => ['https://commons.wikimedia.org/wiki/File:X.jpg'],
            'autre hôte wikimedia' => ['https://wikimedia.org/x.jpg'],
        ];
    }

    /** AC4 — une URL hors de `upload.wikimedia.org` et `thumb.wikimedia.org` n'est jamais appelée. */
    #[DataProvider('urlsHorsDUploadWikimedia')]
    public function test_une_url_hors_upload_wikimedia_est_refusee_sans_etre_appelee(string $ailleurs): void
    {
        $this->actingAsRole('super_admin');
        Http::fake([
            'commons.wikimedia.org/*' => Http::response($this->reponseCommons([$this->pageCommons('File:Mermoz Dakar.jpg', ['url' => $ailleurs, 'thumburl' => $ailleurs])])),
            '*' => Http::response($this->octetsJpeg()),
        ]);

        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'wikimedia', 'title' => 'File:Mermoz Dakar.jpg'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'geo_cover.source_invalid');

        Http::assertSentCount(1);
        $this->assertCount(0, $this->mermoz->refresh()->getMedia('cover'));
    }

    public function test_un_titre_inconnu_de_commons_rend_422_source_not_found(): void
    {
        $this->actingAsRole('super_admin');
        Http::fake(['commons.wikimedia.org/*' => Http::response($this->reponseCommons([['ns' => 6, 'title' => 'File:Nope.jpg', 'missing' => true]]))]);

        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'wikimedia', 'title' => 'File:Nope.jpg'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'geo_cover.source_not_found');
    }

    /** @return array<string, array{\Closure}> */
    public static function pannesDeCommons(): array
    {
        return [
            'injoignable' => [fn () => throw new ConnectionException('timeout')],
            'erreur 500' => [fn () => Http::response('boom', 500)],
            'corps illisible' => [fn () => Http::response('<html>', 200)],
        ];
    }

    #[DataProvider('pannesDeCommons')]
    public function test_commons_en_panne_rend_503_source_unavailable(\Closure $panne): void
    {
        $this->actingAsRole('super_admin');
        Http::fake(['commons.wikimedia.org/*' => $panne]);

        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'wikimedia', 'title' => 'File:Mermoz Dakar.jpg'])
            ->assertStatus(503)
            ->assertJsonPath('code', 'geo_cover.source_unavailable');
        $this->assertCount(0, $this->mermoz->refresh()->getMedia('cover'));
    }

    /** @return array<string, array{\Closure}> */
    public static function telechargementsRefuses(): array
    {
        return [
            'pas une image' => [fn (self $t) => '<html>pas une image</html>'],
            'gif' => [fn (self $t) => (string) UploadedFile::fake()->image('a.gif', 900, 900)->getContent()],
            'plus de 10 Mo' => [fn (self $t) => $t->octetsJpeg().str_repeat("\0", 10 * 1024 * 1024)],
        ];
    }

    /** Le fichier téléchargé passe les règles d'un envoi : type d'image admis, 10 Mo au plus. */
    #[DataProvider('telechargementsRefuses')]
    public function test_un_telechargement_hors_des_regles_d_un_envoi_est_refuse(\Closure $octets): void
    {
        $this->actingAsRole('super_admin');
        $this->commonsRend($this->pageCommons('File:Mermoz Dakar.jpg'), $octets($this));

        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'wikimedia', 'title' => 'File:Mermoz Dakar.jpg'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'geo_cover.source_invalid');

        $this->assertCount(0, $this->mermoz->refresh()->getMedia('cover'));
    }

    public function test_l_import_valide_sa_forme(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'unsplash', 'title' => 'File:X.jpg'])
            ->assertStatus(422)->assertJsonValidationErrors('source');
        $this->postJson($this->url($this->mermoz, '/import'), ['source' => 'wikimedia', 'title' => 'https://evil.example/x.jpg'])
            ->assertStatus(422)->assertJsonValidationErrors('title');
        Http::assertNothingSent();
    }

    /** L'index de la console : `cover` par ligne, et le tri par usage. */
    public function test_l_index_rend_la_photo_et_trie_par_nombre_d_adresses(): void
    {
        $this->actingAsRole('super_admin');
        $ouakam = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Ouakam', 'slug' => 'ouakam']);
        foreach (range(1, 2) as $i) {
            Address::factory()->create(['geo_city_id' => $this->ville->id, 'geo_neighborhood_id' => $ouakam->id, 'city' => 'Dakar', 'neighborhood' => 'Ouakam']);
        }
        $this->post($this->url($this->mermoz), ['file' => UploadedFile::fake()->image('a.jpg', 900, 900)], ['Accept' => 'application/json'])->assertOk();

        $reponse = $this->getJson("/api/admin/geo/neighborhoods?filter[status]=approved&filter[geo_city_id]={$this->ville->id}&sort=-addresses_count")
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Ouakam')
            ->assertJsonPath('data.0.cover', null)
            ->assertJsonPath('data.1.name', 'Mermoz')
            ->assertJsonPath('data.1.cover.source', 'upload');
        $this->assertStringContainsString('-display.webp', (string) $reponse->json('data.1.cover.url'));
        $this->assertSame(['url', 'source'], array_keys($reponse->json('data.1.cover')));
    }
}
