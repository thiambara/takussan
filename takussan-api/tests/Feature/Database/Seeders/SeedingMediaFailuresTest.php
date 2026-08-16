<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Property;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\YearOfActivitySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use ReflectionMethod;
use Tests\TestCase;

/**
 * TCK-301 — les échecs de téléchargement de médias ne sont plus muets.
 *
 * `SeedingContext::downloadMedia()` avalait tout dans un `catch (\Throwable) {}`
 * vide et `resolveCachedMedia()` rendait `null` sur un HTTP non-2xx : hors ligne,
 * derrière un proxy ou limité par picsum.photos, `migrate:fresh --seed` sortait
 * en 0 sur une base sans la moindre photo. Ces tests fixent le contrat inverse :
 * on compte, on nomme, et on sort en erreur au-delà du seuil.
 */
class SeedingMediaFailuresTest extends TestCase
{
    use RefreshDatabase;

    /** PNG 1×1 valide — le plus petit corps que medialibrary accepte réellement. */
    private const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    /**
     * Jeton unique par exécution, injecté dans chaque URL.
     *
     * ⚠ `SeedingContext::resolveCachedMedia()` écrit dans
     * `storage/app/seed-media-cache/`, un répertoire qui SURVIT à la suite.
     * Avec des URL fixes, le deuxième `php artisan test` trouvait en cache les
     * fichiers téléchargés par le premier, sautait l'appel HTTP, et le test du
     * seuil passait au vert sans jamais exercer le compteur. Un test vert dont
     * le vert vient d'un fichier laissé par la veille ne prouve rien.
     */
    private string $jeton;

    /** @var array<int, string> URL utilisées, pour nettoyer leur entrée de cache. */
    private array $urlsUtilisees = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->jeton = bin2hex(random_bytes(8));

        // Le drapeau est à `false` par défaut (config/database.php) — c'est
        // précisément le défaut que TCK-301 restaure dans .env.example et
        // .env.docker. Ces tests-ci portent sur le chemin activé.
        Config::set('database.seed_download_media', true);
    }

    protected function tearDown(): void
    {
        foreach ($this->urlsUtilisees as $url) {
            foreach (glob(storage_path('app/seed-media-cache/'.sha1($url).'.*')) ?: [] as $fichier) {
                @unlink($fichier);
            }
        }
        $this->urlsUtilisees = [];

        parent::tearDown();
    }

    /** Construit une URL unique à cette exécution, et la retient pour le nettoyage. */
    private function url(string $suffixe): string
    {
        $url = "https://picsum.photos/seed/{$this->jeton}-{$suffixe}/800/600";
        $this->urlsUtilisees[] = $url;

        return $url;
    }

    public function test_un_echec_http_est_compte_avec_sa_raison(): void
    {
        Http::fake(['*' => Http::response('', 503)]);

        $context = new SeedingContext;
        $property = Property::factory()->create();

        $context->downloadMedia($property, $this->url('x'), 'photos');

        $this->assertSame(1, $context->mediaDownloadAttempts());
        $this->assertSame(1, $context->mediaDownloadFailures());
        $this->assertSame(['HTTP 503' => 1], $context->mediaFailureReasons());
        $this->assertTrue($property->fresh()->getMedia('photos')->isEmpty());
    }

    public function test_une_exception_reseau_est_comptee_une_seule_fois(): void
    {
        Http::fake(fn () => throw new \RuntimeException('Could not resolve host: picsum.photos'));

        $context = new SeedingContext;
        $property = Property::factory()->create();

        $context->downloadMedia($property, $this->url('y'), 'photos');

        $this->assertSame(1, $context->mediaDownloadAttempts());
        // UNE fois, pas deux : l'échec ne doit pas être inscrit à la fois par
        // resolveCachedMedia() et par le catch, sans quoi le taux dépasse 100 %.
        $this->assertSame(1, $context->mediaDownloadFailures());
        $this->assertCount(1, $context->mediaFailureReasons());
        $this->assertStringContainsString(
            'Could not resolve host',
            array_key_first($context->mediaFailureReasons()),
        );
    }

    public function test_aucune_tentative_n_est_comptee_quand_le_drapeau_est_faux(): void
    {
        Config::set('database.seed_download_media', false);
        Http::fake(['*' => Http::response('', 503)]);

        $context = new SeedingContext;

        $context->downloadMedia(Property::factory()->create(), $this->url('z'), 'photos');

        $this->assertSame(0, $context->mediaDownloadAttempts());
        $this->assertSame(0, $context->mediaDownloadFailures());
        Http::assertNothingSent();
    }

    public function test_le_seeder_leve_au_dela_du_seuil_d_echecs(): void
    {
        // 12 échecs sur 12 = 100 % > 10 % : le seeding ne doit pas se déclarer réussi.
        $context = $this->contextAvecEchecs(attempts: 12, failures: 12);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/Seeding des médias INCOMPLET/');

        $this->reportMediaDownloads($context);
    }

    public function test_le_seeder_ne_leve_pas_sous_le_seuil(): void
    {
        // 1 échec sur 20 = 5 % ≤ 10 % : un 5xx sporadique de picsum.photos ne doit
        // pas faire échouer un `migrate:fresh --seed` de vingt minutes.
        $context = $this->contextAvecEchecs(attempts: 20, failures: 1);

        $this->reportMediaDownloads($context);

        $this->assertSame(1, $context->mediaDownloadFailures());
    }

    public function test_le_seeder_ne_dit_rien_quand_aucun_telechargement_n_a_ete_tente(): void
    {
        // Le chemin nominal (SEED_DOWNLOAD_MEDIA=false) reste silencieux.
        $this->reportMediaDownloads(new SeedingContext);

        $this->assertTrue(true);
    }

    /**
     * Fabrique un contexte ayant réellement traversé `downloadMedia()` le nombre
     * de fois voulu — on n'injecte pas les compteurs à la main, sans quoi le test
     * ne prouverait rien du code qui les incrémente.
     */
    private function contextAvecEchecs(int $attempts, int $failures): SeedingContext
    {
        $context = new SeedingContext;
        $property = Property::factory()->create();

        // UN SEUL `Http::fake()`, qui décide d'après l'URL.
        //
        // ⚠ `Http::fake()` appelé plusieurs fois MERGE les stubs, il ne les remplace
        // pas : un `['*' => 500]` posé au premier tour de boucle répondait encore au
        // vingtième, et les 20 tentatives échouaient là où une seule devait échouer.
        // Un VRAI PNG sur le chemin qui réussit, par ailleurs — medialibrary rejette
        // un corps arbitraire, et compter ce rejet comme un échec réseau ferait
        // mesurer au test autre chose que ce qu'il prétend mesurer.
        Http::fake(function ($request) use ($failures) {
            preg_match('/seuil-(\d+)/', $request->url(), $m);

            return ((int) ($m[1] ?? 0)) < $failures
                ? Http::response('', 500)
                : Http::response(base64_decode(self::PNG_1X1_BASE64), 200, ['Content-Type' => 'image/png']);
        });

        for ($i = 0; $i < $attempts; $i++) {
            $context->downloadMedia($property, $this->url("seuil-{$i}"), 'photos');
        }

        $this->assertSame($attempts, $context->mediaDownloadAttempts());
        $this->assertSame($failures, $context->mediaDownloadFailures());

        return $context;
    }

    private function reportMediaDownloads(SeedingContext $context): void
    {
        $method = new ReflectionMethod(YearOfActivitySeeder::class, 'reportMediaDownloads');
        $method->invoke(app(YearOfActivitySeeder::class), $context);
    }
}
