<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\FingerprintRadarSourcePhotos;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\RadarListing;
use App\Services\Radar\HostResolver;
use App\Support\PhotoFingerprint;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * TCK-2387 (ADR-0054, ADR-0077) — le calcul, en file `media`, de l'empreinte des photos source d'une
 * annonce-URL : une passe écrit après chaque photo, s'arrête au budget, se relâche sur une lecture
 * différée, et ne réécrit jamais une annonce qui a quitté l'étape.
 *
 * Aucun réseau : `Http::fake()` et un résolveur DNS doublé (trois domaines publics).
 */
class FingerprintRadarSourcePhotosTest extends TestCase
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
        $image = imagecreatetruecolor(90, 80);
        for ($y = 0; $y < 8; $y++) {
            for ($x = 0; $x < 9; $x++) {
                $grey = mt_rand(0, 255);
                imagefilledrectangle($image, $x * 10, $y * 10, $x * 10 + 9, $y * 10 + 9, imagecolorallocate($image, $grey, $grey, $grey));
            }
        }
        ob_start();
        imagepng($image);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);

        return $bytes;
    }

    /** @param  list<string>  $urls */
    private function annonce(array $urls, array $attributs = []): RadarListing
    {
        return RadarListing::factory()->extracted()->create($attributs + [
            'source_kind' => RadarSourceKind::Url,
            'source_url' => 'https://sn.coinafrique.com/annonce/42',
            'photo_urls' => $urls,
        ]);
    }

    /** Sert chaque URL de `$urls` (une PNG distincte par rang) ; tout `robots.txt` est absent. */
    private function servir(array $urls): void
    {
        $reponses = ['*/robots.txt' => Http::response('', 404)];
        foreach ($urls as $i => $url) {
            $reponses[$url] = Http::response(self::png($i + 1), 200, ['Content-Type' => 'image/png']);
        }
        Http::fake($reponses);
    }

    private function lancer(RadarListing $listing): FingerprintRadarSourcePhotos
    {
        $job = (new FingerprintRadarSourcePhotos($listing->id))->withFakeQueueInteractions();
        $this->app->call([$job, 'handle']);

        return $job;
    }

    /** @return list<string> */
    private static function urls(int $n): array
    {
        return array_map(fn (int $i) => 'https://'.self::HOTES[$i % 3].'/p/'.$i.'.png', range(0, $n - 1));
    }

    public function test_les_empreintes_et_leurs_bandes_sont_gardees(): void
    {
        $urls = self::urls(3);
        $this->servir($urls);
        $listing = $this->annonce($urls);

        $this->lancer($listing)->assertNotReleased();

        $listing->refresh();
        $this->assertCount(3, $listing->source_photo_hashes);
        foreach ($listing->source_photo_hashes as $i => $entry) {
            $hash = PhotoFingerprint::fromBinary(self::png($i + 1));
            [$b0, $b1, $b2, $b3] = PhotoFingerprint::bands($hash);
            $this->assertSame($urls[$i], $entry['url']);
            $this->assertSame($hash, $entry['hash']);
            $this->assertSame([$b0, $b1, $b2, $b3], [$entry['b0'], $entry['b1'], $entry['b2'], $entry['b3']]);
        }
        $this->assertSame(['status' => 'done', 'total' => 3, 'done' => 3], $listing->photoFingerprintStatus());
    }

    public function test_une_photo_refusee_garde_son_code_et_n_arrete_pas_la_passe(): void
    {
        $urls = ['http://127.0.0.1/p.png', ...self::urls(1)];
        $this->servir($urls);
        $listing = $this->annonce($urls);

        $this->lancer($listing);

        $entries = $listing->refresh()->source_photo_hashes;
        $this->assertSame(['url' => $urls[0], 'hash' => null, 'error' => 'radar.fetch.private_address'], $entries[0]);
        $this->assertIsInt($entries[1]['hash']);
    }

    public function test_une_passe_s_arrete_et_se_relache_au_budget_en_gardant_la_premiere_photo(): void
    {
        config(['radar.photos.pass_budget_seconds' => 0]);
        $urls = self::urls(3);
        $this->servir($urls);
        $listing = $this->annonce($urls);

        $this->lancer($listing)->assertReleased(0);

        $listing->refresh();
        // Toujours au moins une photo par passe : sinon un budget nul ne ferait jamais avancer.
        $this->assertCount(1, $listing->source_photo_hashes);
        $this->assertSame($urls[0], $listing->source_photo_hashes[0]['url']);
        $this->assertSame(['status' => 'pending', 'total' => 3, 'done' => 1], $listing->photoFingerprintStatus());
    }

    public function test_la_passe_suivante_reprend_ou_la_precedente_s_est_arretee(): void
    {
        config(['radar.photos.pass_budget_seconds' => 0]);
        $urls = self::urls(3);
        $this->servir($urls);
        $listing = $this->annonce($urls);

        $this->lancer($listing);
        $this->lancer($listing);
        $this->lancer($listing)->assertNotReleased();

        $this->assertSame($urls, array_column($listing->refresh()->source_photo_hashes, 'url'));
    }

    public function test_une_lecture_differee_relache_le_job_du_delai_demande_et_garde_le_progres(): void
    {
        // Deux photos du même domaine : la seconde trouve le créneau pris.
        $urls = ['https://a.cdn.test/p/1.png', 'https://a.cdn.test/p/2.png'];
        $this->servir($urls);
        $listing = $this->annonce($urls);

        // Le temps figé : le créneau pris à l'instant T se rouvre à T + `min_delay_seconds` (5 s).
        $this->freezeTime();

        $this->lancer($listing)->assertReleased(5);

        $listing->refresh();
        $this->assertCount(1, $listing->source_photo_hashes);
        $this->assertSame($urls[0], $listing->source_photo_hashes[0]['url']);
    }

    public function test_une_annonce_ecartee_en_cours_de_passe_n_est_pas_reecrite(): void
    {
        $urls = self::urls(2);
        $listing = $this->annonce($urls);
        Http::fake([
            '*/robots.txt' => Http::response('', 404),
            '*' => function () use ($listing) {
                // L'opérateur écarte l'annonce pendant que la première photo se lit.
                RadarListing::query()->whereKey($listing->id)->update(['stage' => RadarListingStage::Discarded->value]);

                return Http::response(self::png(1), 200, ['Content-Type' => 'image/png']);
            },
        ]);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::Discarded, $listing->stage);
        $this->assertNull($listing->source_photo_hashes);
        Http::assertSentCount(2); // robots.txt + la première photo : la seconde n'est pas lue.
    }

    public function test_une_reprise_ne_double_jamais_une_photo_deja_ecrite(): void
    {
        $urls = self::urls(2);
        $listing = $this->annonce($urls);
        $dejaLa = ['url' => $urls[0], 'hash' => null, 'error' => 'radar.fetch.timeout'];
        Http::fake([
            '*/robots.txt' => Http::response('', 404),
            '*' => function () use ($listing, $dejaLa) {
                // Une autre passe (reprise après un timeout) a écrit la première photo pendant la lecture.
                RadarListing::query()->whereKey($listing->id)->update(['source_photo_hashes' => json_encode([$dejaLa])]);

                return Http::response(self::png(1), 200, ['Content-Type' => 'image/png']);
            },
        ]);

        $this->lancer($listing);

        $this->assertSame([$dejaLa], $listing->refresh()->source_photo_hashes);
    }

    public function test_au_plus_max_per_listing_photos(): void
    {
        config(['radar.photos.max_per_listing' => 2]);
        $urls = self::urls(3);
        $this->servir($urls);
        $listing = $this->annonce($urls);

        $this->lancer($listing)->assertNotReleased();

        $this->assertSame(array_slice($urls, 0, 2), array_column($listing->refresh()->source_photo_hashes, 'url'));
        $this->assertSame('done', $listing->photoFingerprintStatus()['status']);
    }

    public function test_une_annonce_texte_ne_fait_rien(): void
    {
        Http::fake();
        $listing = RadarListing::factory()->extracted()->create(['source_kind' => RadarSourceKind::Text, 'photo_urls' => self::urls(2)]);

        $this->lancer($listing);

        Http::assertNothingSent();
        $this->assertNull($listing->refresh()->source_photo_hashes);
    }

    public function test_une_annonce_qui_n_est_ni_extraite_ni_relue_ne_fait_rien(): void
    {
        Http::fake();
        foreach ([RadarListingStage::Captured, RadarListingStage::DoNotContact, RadarListingStage::Duplicate] as $stage) {
            $listing = $this->annonce(self::urls(1), ['stage' => $stage]);

            $this->lancer($listing);

            $this->assertNull($listing->refresh()->source_photo_hashes, $stage->value);
        }
        Http::assertNothingSent();
    }

    public function test_une_annonce_relue_est_calculee_aussi(): void
    {
        $urls = self::urls(1);
        $this->servir($urls);
        $listing = $this->annonce($urls, ['stage' => RadarListingStage::Reviewed]);

        $this->lancer($listing);

        $this->assertCount(1, $listing->refresh()->source_photo_hashes);
    }

    public function test_sans_photo_a_tenter_le_resultat_est_une_liste_vide(): void
    {
        Http::fake();
        $listing = $this->annonce([]);

        $this->lancer($listing);

        $this->assertSame([], $listing->refresh()->source_photo_hashes);
        Http::assertNothingSent();
    }

    public function test_une_passe_deja_complete_ne_relit_rien(): void
    {
        $urls = self::urls(1);
        $listing = $this->annonce($urls);
        $listing->update(['source_photo_hashes' => [['url' => $urls[0], 'hash' => null, 'error' => 'radar.fetch.timeout']]]);
        Http::fake();

        $this->lancer($listing)->assertNotReleased();

        Http::assertNothingSent();
        $this->assertCount(1, $listing->refresh()->source_photo_hashes);
    }

    public function test_failed_complete_les_url_restantes_pour_que_l_etat_finisse_done(): void
    {
        $urls = self::urls(3);
        $listing = $this->annonce($urls);
        $listing->update(['source_photo_hashes' => [['url' => $urls[0], 'hash' => 5, 'b0' => 0, 'b1' => 0, 'b2' => 0, 'b3' => 5]]]);

        (new FingerprintRadarSourcePhotos($listing->id))->failed(new \RuntimeException('boum'));

        $listing->refresh();
        $this->assertSame(5, $listing->source_photo_hashes[0]['hash']);
        $this->assertSame(
            [['url' => $urls[1], 'hash' => null, 'error' => 'radar.photo.abandoned'], ['url' => $urls[2], 'hash' => null, 'error' => 'radar.photo.abandoned']],
            array_slice($listing->source_photo_hashes, 1),
        );
        $this->assertSame('done', $listing->photoFingerprintStatus()['status']);
    }

    public function test_failed_ne_touche_pas_une_annonce_ecartee(): void
    {
        $listing = $this->annonce(self::urls(2), ['stage' => RadarListingStage::Discarded]);

        (new FingerprintRadarSourcePhotos($listing->id))->failed(null);

        $this->assertNull($listing->refresh()->source_photo_hashes);
    }

    public function test_le_job_atterrit_sur_la_file_media_et_est_unique_par_annonce(): void
    {
        Queue::fake();

        FingerprintRadarSourcePhotos::dispatch(12);

        Queue::assertPushedOn('media', FingerprintRadarSourcePhotos::class);
        $job = new FingerprintRadarSourcePhotos(12);
        $this->assertInstanceOf(ShouldBeUnique::class, $job);
        $this->assertSame('12', $job->uniqueId());
        $this->assertSame($job->uniqueFor, (int) now()->diffInSeconds($job->retryUntil(), true), 'Unique sur toute la fenêtre de reprise.');
    }

    public function test_les_delais_du_job_respectent_le_retry_after_de_la_connexion(): void
    {
        $job = new FingerprintRadarSourcePhotos(1);

        // ADR-0078 : `$timeout` + 5 s au plus du `retry_after` de `database` (90 s).
        $this->assertSame(85, $job->timeout);
        $this->assertLessThanOrEqual((int) config('queue.connections.database.retry_after'), $job->timeout + 5);
        $this->assertFalse($job->failOnTimeout);
        $this->assertEqualsWithDelta(6 * 3600, now()->diffInSeconds($job->retryUntil()), 5);
        $this->assertInstanceOf(WithoutOverlapping::class, $job->middleware()[0]);
        // Sans `backoff()` et sans `--backoff` du worker, une exception imprévue rejouerait le job sans délai.
        $this->assertNotEmpty($job->backoff());
        $this->assertSame([], array_filter($job->backoff(), fn (int $s) => $s <= 0));
    }

    public function test_le_pire_cas_d_une_passe_tient_dans_le_timeout(): void
    {
        // Budget de la passe + une lecture (délai total) + marge de décodage < `$timeout`.
        $pire = (int) config('radar.photos.pass_budget_seconds') + (int) config('radar.fetch.total_timeout_seconds');

        $this->assertLessThan((new FingerprintRadarSourcePhotos(1))->timeout, $pire);
    }
}
