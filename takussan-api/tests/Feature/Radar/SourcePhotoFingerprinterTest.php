<?php

namespace Tests\Feature\Radar;

use App\Models\RadarListing;
use App\Services\Radar\Exceptions\RadarFetchDeferred;
use App\Services\Radar\HostResolver;
use App\Services\Radar\SourcePhotoFingerprinter;
use App\Support\PhotoFingerprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

/**
 * TCK-2387 (ADR-0054, ADR-0077 §9) — l'empreinte d'une photo source : lue par le chemin protégé de
 * `UrlFetcher`, décodée en mémoire, jetée. Rien ne reste, ni sur disque ni en base, que l'empreinte.
 *
 * Aucun réseau : `Http::fake()` et un résolveur DNS doublé.
 */
class SourcePhotoFingerprinterTest extends TestCase
{
    use RefreshDatabase;

    private const URL = 'https://sn.coinafrique.com/photos/1.png';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Cache::flush();
        $this->app->instance(HostResolver::class, new class implements HostResolver
        {
            public function resolve(string $host): array
            {
                return $host === 'sn.coinafrique.com' ? ['93.184.216.34'] : [];
            }
        });
    }

    /** Une PNG de 360 × 320 à 9 × 8 aplats gris (motif de `DuplicateListingDetectorTest::png()`). */
    private static function png(int $seed = 7): string
    {
        mt_srand($seed);
        $image = imagecreatetruecolor(360, 320);
        for ($y = 0; $y < 8; $y++) {
            for ($x = 0; $x < 9; $x++) {
                $grey = mt_rand(0, 255);
                imagefilledrectangle($image, $x * 40, $y * 40, $x * 40 + 39, $y * 40 + 39, imagecolorallocate($image, $grey, $grey, $grey));
            }
        }
        ob_start();
        imagepng($image);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);

        return $bytes;
    }

    /** Une PNG dont l'en-tête annonce `$w` × `$h` pixels : de quoi mentir à GD sans rien allouer. */
    private static function headerOnlyPng(int $w, int $h): string
    {
        $ihdr = pack('NN', $w, $h)."\x08\x02\x00\x00\x00";
        $chunk = fn (string $type, string $data) => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));

        return "\x89PNG\r\n\x1a\n".$chunk('IHDR', $ihdr).$chunk('IEND', '');
    }

    private function serve(string $bytes, string $type = 'image/png'): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/*' => Http::response($bytes, 200, ['Content-Type' => $type]),
        ]);
    }

    private function fingerprinter(): SourcePhotoFingerprinter
    {
        return $this->app->make(SourcePhotoFingerprinter::class);
    }

    /** @return list<string> */
    private function newTempFilesHolding(string $bytes, array $before): array
    {
        $holding = [];
        foreach (array_diff(scandir(sys_get_temp_dir()) ?: [], $before, ['.', '..']) as $name) {
            $path = sys_get_temp_dir().'/'.$name;
            if (is_file($path) && @file_get_contents($path) === $bytes) {
                $holding[] = $path;
            }
        }

        return $holding;
    }

    public function test_ac4_aucun_fichier_de_photo_source_ne_subsiste(): void
    {
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
        // `Http::fake()` n'emprunte pas le tampon du vrai client : que le corps ne déborde pas sur disque
        // se prouve dans `BoundedSinkTest` ; ici, que rien d'autre n'en garde une copie.
        $png = self::png();
        $avant = scandir(sys_get_temp_dir()) ?: [];
        $this->serve($png);
        $listing = RadarListing::factory()->create();

        $entry = $this->fingerprinter()->fingerprint(self::URL);
        $listing->update(['source_photo_hashes' => [$entry]]);

        $this->assertIsInt($entry['hash']);
        $this->assertSame([], $this->newTempFilesHolding($png, $avant));
        $this->assertSame([], Storage::disk(config('media-library.disk_name'))->allFiles());
        $this->assertSame([], Storage::disk(config('media-library.public_disk_name'))->allFiles());
        $this->assertSame(0, Media::query()->count());
        // La ligne de l'annonce ne contient que l'URL, des entiers : jamais les octets.
        $ligne = (string) json_encode(RadarListing::query()->whereKey($listing->id)->first()->getAttributes());
        $this->assertStringNotContainsString(base64_encode($png), $ligne);
        $this->assertStringNotContainsString(substr(base64_encode($png), 0, 40), $ligne);
        $this->assertLessThan(1000, strlen((string) json_encode($entry)));
    }

    public function test_l_empreinte_est_celle_d_adr_0054_avec_ses_bandes(): void
    {
        $png = self::png(11);
        $this->serve($png);

        $entry = $this->fingerprinter()->fingerprint(self::URL);

        $hash = PhotoFingerprint::fromBinary($png);
        [$b0, $b1, $b2, $b3] = PhotoFingerprint::bands($hash);
        $this->assertSame(['url' => self::URL, 'hash' => $hash, 'b0' => $b0, 'b1' => $b1, 'b2' => $b2, 'b3' => $b3], $entry);
    }

    public function test_une_image_aux_dimensions_demesurees_n_est_jamais_decodee(): void
    {
        // L'en-tête dit 20 000 × 20 000 : décoder demanderait ~1,6 Go. Les octets ne sont pas une image
        // complète, donc un décodage rendrait `unreadable` — c'est `too_many_pixels` qui prouve qu'on s'est arrêté avant.
        $this->serve(self::headerOnlyPng(20_000, 20_000));

        $entry = $this->fingerprinter()->fingerprint(self::URL);

        $this->assertSame(['url' => self::URL, 'hash' => null, 'error' => 'radar.photo.too_many_pixels'], $entry);
    }

    public function test_une_image_trop_large_ou_trop_haute_est_refusee_meme_sous_le_nombre_de_pixels(): void
    {
        $this->serve(self::headerOnlyPng(13_000, 10));

        $this->assertSame('radar.photo.too_many_pixels', $this->fingerprinter()->fingerprint(self::URL)['error']);
    }

    public function test_des_octets_illisibles_declares_png_ne_sont_pas_une_image(): void
    {
        $this->serve('ceci n\'est pas une image');

        $this->assertSame(['url' => self::URL, 'hash' => null, 'error' => 'radar.fetch.not_image'], $this->fingerprinter()->fingerprint(self::URL));
    }

    public function test_une_image_a_l_en_tete_valide_mais_au_corps_tronque_est_illisible(): void
    {
        $this->serve(substr(self::png(), 0, 60));

        $entry = $this->fingerprinter()->fingerprint(self::URL);

        $this->assertNull($entry['hash']);
        $this->assertContains($entry['error'], ['radar.photo.unreadable', 'radar.fetch.not_image']);
    }

    public function test_une_url_refusee_donne_un_hash_nul_et_son_code(): void
    {
        Http::fake();

        $entry = $this->fingerprinter()->fingerprint('http://127.0.0.1/photo.png');

        $this->assertSame(['url' => 'http://127.0.0.1/photo.png', 'hash' => null, 'error' => 'radar.fetch.private_address'], $entry);
    }

    public function test_une_lecture_differee_remonte_a_l_appelant(): void
    {
        $this->serve(self::png());
        $this->fingerprinter()->fingerprint(self::URL);

        $this->expectException(RadarFetchDeferred::class);
        $this->fingerprinter()->fingerprint('https://sn.coinafrique.com/photos/2.png');
    }
}
