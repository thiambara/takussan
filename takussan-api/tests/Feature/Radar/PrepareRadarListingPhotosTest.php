<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\PrepareRadarListingPhotos;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\RadarListing;
use App\Services\Radar\HostResolver;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * TCK-2389 (décision 3a) — le téléchargement des photos d'une annonce-URL APRÈS l'accord confirmé, en file `media` :
 * même patron que `FingerprintRadarSourcePhotos` (passe bornée, écriture sous verrou après chaque photo, élément
 * attendu par son rang), mais la photo est réencodée et RANGÉE dans `radar_photos` (disque privé).
 *
 * Aucun réseau : `Http::fake()` et un résolveur DNS doublé (trois domaines publics).
 */
class PrepareRadarListingPhotosTest extends TestCase
{
    use RefreshDatabase;

    private const HOTES = ['a.cdn.test', 'b.cdn.test', 'c.cdn.test'];

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Cache::flush();
        $this->app->instance(HostResolver::class, new class implements HostResolver
        {
            public function resolve(string $host): array
            {
                return str_ends_with($host, '.cdn.test') ? ['93.184.216.34'] : [];
            }
        });
    }

    private static function png(int $seed): string
    {
        mt_srand($seed);
        $image = imagecreatetruecolor(30, 20);
        for ($y = 0; $y < 20; $y++) {
            for ($x = 0; $x < 30; $x++) {
                imagesetpixel($image, $x, $y, mt_rand(0, 0xFFFFFF));
            }
        }
        ob_start();
        imagepng($image);

        return (string) ob_get_clean();
    }

    /** @param  list<string>  $urls */
    private function annonce(array $urls, array $attributs = []): RadarListing
    {
        return RadarListing::factory()->extracted()->create($attributs + [
            'stage' => RadarListingStage::Consented,
            'source_kind' => RadarSourceKind::Url,
            'source_url' => 'https://sn.coinafrique.com/annonce/42',
            'photo_urls' => $urls,
        ]);
    }

    /** @param  list<string>  $urls */
    private function servir(array $urls): void
    {
        $reponses = ['*/robots.txt' => Http::response('', 404)];
        foreach ($urls as $i => $url) {
            $reponses[$url] = Http::response(self::png($i + 1), 200, ['Content-Type' => 'image/png']);
        }
        Http::fake($reponses);
    }

    private function lancer(RadarListing $listing): PrepareRadarListingPhotos
    {
        $job = (new PrepareRadarListingPhotos($listing->id))->withFakeQueueInteractions();
        $this->app->call([$job, 'handle']);

        return $job;
    }

    /** @return list<string> */
    private static function urls(int $n): array
    {
        return array_map(fn (int $i) => 'https://'.self::HOTES[$i % 3].'/p/'.$i.'.png', range(0, $n - 1));
    }

    public function test_les_photos_lisibles_sont_rangees_dans_la_reserve_privee(): void
    {
        $urls = self::urls(3);
        $this->servir($urls);
        $listing = $this->annonce($urls);

        $this->lancer($listing)->assertNotReleased();

        $listing->refresh();
        $medias = $listing->getMedia('radar_photos');
        $this->assertCount(3, $medias);
        foreach ($listing->photo_preparation as $i => $element) {
            $this->assertSame($urls[$i], $element['url']);
            $this->assertSame($medias[$i]->id, $element['media_id']);
            $this->assertSame('fetched', $medias[$i]->getCustomProperty('origin'));
            $this->assertSame($urls[$i], $medias[$i]->getCustomProperty('source_url'));
            $this->assertNotSame(config('media-library.public_disk_name'), $medias[$i]->disk);
            $this->assertTrue(Storage::disk($medias[$i]->disk)->exists($medias[$i]->getPathRelativeToRoot()));
        }
        $this->assertSame(['status' => 'done', 'total' => 3, 'done' => 3], $listing->photoPreparationStatus());
    }

    public function test_une_url_refusee_garde_son_code_et_n_arrete_pas_la_passe(): void
    {
        $urls = ['http://127.0.0.1/p.png', ...self::urls(1)];
        $this->servir($urls);
        $listing = $this->annonce($urls);

        $this->lancer($listing);

        $listing->refresh();
        // jsonb ne garde pas l'ordre des clés : on compare sans l'ordre.
        $this->assertEquals(['url' => $urls[0], 'media_id' => null, 'error' => 'radar.fetch.private_address'], $listing->photo_preparation[0]);
        $this->assertIsInt($listing->photo_preparation[1]['media_id']);
        $this->assertCount(1, $listing->getMedia('radar_photos'));
    }

    public function test_une_image_illisible_ou_demesuree_note_son_erreur_sans_rien_ranger(): void
    {
        config(['radar.photos.max_pixels' => 100]);
        $urls = self::urls(1);
        $this->servir($urls);
        $listing = $this->annonce($urls);

        $this->lancer($listing);

        $this->assertEquals(
            [['url' => $urls[0], 'media_id' => null, 'error' => 'radar.photo.too_large']],
            $listing->refresh()->photo_preparation,
        );
        $this->assertSame(0, $listing->media()->count());
    }

    public function test_deux_passes_a_la_suite_ne_rangent_jamais_deux_fois_une_photo(): void
    {
        $urls = self::urls(2);
        $this->servir($urls);
        $listing = $this->annonce($urls);

        $this->lancer($listing);
        $this->lancer($listing)->assertNotReleased();

        $listing->refresh();
        $this->assertCount(2, $listing->getMedia('radar_photos'));
        $this->assertSame($urls, array_column($listing->photo_preparation, 'url'));
    }

    public function test_deux_passes_qui_se_chevauchent_ne_rangent_jamais_deux_fois_une_photo(): void
    {
        $urls = self::urls(2);
        $listing = $this->annonce($urls);
        $imbriquee = false;
        Http::fake([
            '*/robots.txt' => Http::response('', 404),
            '*' => function () use ($listing, &$imbriquee) {
                // Pendant que la passe A lit sa première photo, une passe B (reprise) part du même état et va au bout.
                if (! $imbriquee) {
                    $imbriquee = true;
                    // Le créneau du domaine, pris par A, est rendu : B lit sans être différée.
                    Cache::flush();
                    $this->lancer($listing);
                }

                return Http::response(self::png(1), 200, ['Content-Type' => 'image/png']);
            },
        ]);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertCount(2, $listing->photo_preparation, 'la passe B a bien écrit avant A');
        $this->assertCount(2, $listing->getMedia('radar_photos'), 'la passe A, arrivée en retard, ne range rien');
        $this->assertSame($urls, array_column($listing->photo_preparation, 'url'));
        $this->assertCount(2, array_unique($listing->getMedia('radar_photos')->map(fn ($m) => $m->getCustomProperty('source_url'))->all()));
    }

    public function test_une_reprise_dont_le_rang_est_deja_pris_ne_range_rien(): void
    {
        $urls = self::urls(2);
        $listing = $this->annonce($urls);
        $dejaLa = ['url' => $urls[0], 'media_id' => null, 'error' => 'radar.fetch.timeout'];
        Http::fake([
            '*/robots.txt' => Http::response('', 404),
            '*' => function () use ($listing, $dejaLa) {
                // Une autre passe (reprise après un timeout) a écrit la première photo pendant la lecture.
                RadarListing::query()->whereKey($listing->id)->update(['photo_preparation' => json_encode([$dejaLa])]);

                return Http::response(self::png(1), 200, ['Content-Type' => 'image/png']);
            },
        ]);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertEquals([$dejaLa], $listing->photo_preparation);
        $this->assertSame(0, $listing->media()->count());
        $this->assertSame([], Storage::disk(config('media-library.disk_name'))->allFiles());
    }

    public function test_une_passe_s_arrete_et_se_relache_au_budget_en_gardant_la_premiere_photo(): void
    {
        config(['radar.photos.pass_budget_seconds' => 0]);
        $urls = self::urls(3);
        $this->servir($urls);
        $listing = $this->annonce($urls);

        $this->lancer($listing)->assertReleased(0);

        $listing->refresh();
        $this->assertCount(1, $listing->photo_preparation);
        $this->assertSame(['status' => 'pending', 'total' => 3, 'done' => 1], $listing->photoPreparationStatus());
    }

    public function test_une_lecture_differee_relache_le_job_du_delai_demande(): void
    {
        $urls = ['https://a.cdn.test/p/1.png', 'https://a.cdn.test/p/2.png'];
        $this->servir($urls);
        $listing = $this->annonce($urls);
        $this->freezeTime();

        $this->lancer($listing)->assertReleased(5);

        $this->assertCount(1, $listing->refresh()->photo_preparation);
    }

    public function test_une_annonce_qui_n_est_plus_consented_n_est_pas_ecrite(): void
    {
        $urls = self::urls(2);
        $listing = $this->annonce($urls);
        Http::fake([
            '*/robots.txt' => Http::response('', 404),
            '*' => function () use ($listing) {
                RadarListing::query()->whereKey($listing->id)->update(['stage' => RadarListingStage::DoNotContact->value]);

                return Http::response(self::png(1), 200, ['Content-Type' => 'image/png']);
            },
        ]);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertNull($listing->photo_preparation);
        $this->assertSame(0, $listing->media()->count());
        $this->assertSame([], Storage::disk(config('media-library.disk_name'))->allFiles());
        Http::assertSentCount(2);
    }

    public function test_une_annonce_qui_n_est_pas_consented_ou_pas_url_ne_fait_rien(): void
    {
        Http::fake();
        foreach ([
            $this->annonce(self::urls(1), ['stage' => RadarListingStage::Reviewed]),
            $this->annonce(self::urls(1), ['source_kind' => RadarSourceKind::Text]),
        ] as $listing) {
            $this->lancer($listing);
            $this->assertNull($listing->refresh()->photo_preparation);
        }
        Http::assertNothingSent();
    }

    public function test_sans_photo_a_tenter_le_resultat_est_une_liste_vide(): void
    {
        Http::fake();
        $listing = $this->annonce([]);

        $this->lancer($listing);

        $this->assertSame([], $listing->refresh()->photo_preparation);
        Http::assertNothingSent();
    }

    public function test_une_relance_ne_retente_que_les_urls_sans_element(): void
    {
        $urls = self::urls(3);
        $this->servir($urls);
        $listing = $this->annonce($urls, ['photo_preparation' => [
            ['url' => $urls[1], 'media_id' => 99],
        ]]);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertEqualsCanonicalizing($urls, array_column($listing->photo_preparation, 'url'));
        $this->assertCount(3, $listing->photo_preparation);
        $this->assertCount(2, $listing->getMedia('radar_photos'));
        Http::assertNotSent(fn ($request) => $request->url() === $urls[1]);
    }

    public function test_la_reserve_pleine_n_en_range_pas_plus(): void
    {
        config(['radar.photos.reserve_max' => 1]);
        $urls = self::urls(2);
        $this->servir($urls);
        $listing = $this->annonce($urls);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertCount(1, $listing->getMedia('radar_photos'));
        $this->assertSame('radar.photo.reserve_full', $listing->photo_preparation[1]['error']);
    }

    public function test_failed_complete_les_url_restantes_pour_que_l_etat_finisse_done(): void
    {
        $urls = self::urls(3);
        $listing = $this->annonce($urls, ['photo_preparation' => [['url' => $urls[0], 'media_id' => 5]]]);

        (new PrepareRadarListingPhotos($listing->id))->failed(new \RuntimeException('boum'));

        $listing->refresh();
        $this->assertEquals(
            [['url' => $urls[1], 'media_id' => null, 'error' => 'radar.photo.abandoned'], ['url' => $urls[2], 'media_id' => null, 'error' => 'radar.photo.abandoned']],
            array_slice($listing->photo_preparation, 1),
        );
        $this->assertSame('done', $listing->photoPreparationStatus()['status']);
    }

    public function test_failed_ne_touche_pas_une_annonce_qui_n_est_plus_consented(): void
    {
        $listing = $this->annonce(self::urls(2), ['stage' => RadarListingStage::DoNotContact]);

        (new PrepareRadarListingPhotos($listing->id))->failed(null);

        $this->assertNull($listing->refresh()->photo_preparation);
    }

    public function test_le_job_atterrit_sur_la_file_media_et_suit_le_patron_du_calcul_d_empreintes(): void
    {
        Queue::fake();

        PrepareRadarListingPhotos::dispatch(12);

        Queue::assertPushedOn('media', PrepareRadarListingPhotos::class);
        $job = new PrepareRadarListingPhotos(12);
        $this->assertInstanceOf(ShouldBeUnique::class, $job);
        $this->assertSame('12', $job->uniqueId());
        $this->assertSame(85, $job->timeout);
        $this->assertLessThanOrEqual((int) config('queue.connections.database.retry_after'), $job->timeout + 5);
        $this->assertFalse($job->failOnTimeout);
        $this->assertInstanceOf(WithoutOverlapping::class, $job->middleware()[0]);
        $this->assertNotEmpty($job->backoff());
        $this->assertLessThan($job->timeout, (int) config('radar.photos.pass_budget_seconds') + (int) config('radar.fetch.total_timeout_seconds'));
    }
}
