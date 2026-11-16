<?php

namespace Tests\Feature\Media;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Spatie\MediaLibrary\Support\UrlGenerator\DefaultUrlGenerator;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-2463 — le retrait de l'intégration CDN de TCK-105 ne change AUCUNE URL de média.
 *
 * Jusqu'ici `media-library.url_generator` valait `CdnUrlGenerator`, qui générait toutes les URL
 * de médias et les rendait telles quelles tant que `cdn.enabled` était faux (partout). Ce test a
 * été joué vert AVANT et APRÈS le retour à `DefaultUrlGenerator` : l'URL publique, l'URL d'une
 * conversion et l'URL présignée (original et conversion, disque privé comme public) sont celles
 * que le disque rend pour le chemin relatif — rien ne les réécrit.
 *
 * Un en-tête `Accept` d'image est posé : c'était l'indice de négociation de format du CDN.
 */
class MediaUrlGenerationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        RemoteDiskFake::install('r2-private');
        RemoteDiskFake::install('r2-media');
        request()->headers->set('Accept', 'image/avif,image/webp,*/*');
    }

    public function test_les_urls_d_une_photo_de_bien_sont_celles_du_disque(): void
    {
        $agency = Agency::factory()->create(['primary_admin_id' => User::factory()->create()->id]);
        $media = Property::factory()->published()->create(['agency_id' => $agency->id])
            ->addMedia(UploadedFile::fake()->image('villa.jpg', 2000, 1500))
            ->toMediaCollection('photos')
            ->refresh();
        $this->assertSame(['r2-private', 'r2-media'], [$media->disk, $media->conversions_disk]);

        $this->assertUrlsDuDisque($media, ['thumbnail', 'preview', 'full']);
    }

    public function test_les_urls_d_une_photo_privee_sont_celles_du_disque(): void
    {
        $media = User::factory()->create()
            ->addMedia(UploadedFile::fake()->image('cuisine.jpg', 900, 900))
            ->toMediaCollection('photos')
            ->refresh();
        $this->assertSame(['r2-private', 'r2-private'], [$media->disk, $media->conversions_disk]);

        $this->assertUrlsDuDisque($media, ['preview']);
    }

    public function test_les_urls_d_un_logo_d_agence_public_sont_celles_du_disque(): void
    {
        $media = Agency::factory()->create(['primary_admin_id' => User::factory()->create()->id])
            ->addMedia(UploadedFile::fake()->image('logo.png', 400, 400))
            ->toMediaCollection('logo')
            ->refresh();
        $this->assertSame('r2-media', $media->disk);

        $this->assertUrlsDuDisque($media, array_keys($media->generated_conversions ?? []));
    }

    public function test_le_generateur_d_url_est_celui_de_spatie(): void
    {
        $this->assertSame(DefaultUrlGenerator::class, config('media-library.url_generator'));
    }

    /** @param list<string> $conversions */
    private function assertUrlsDuDisque(Media $media, array $conversions): void
    {
        $expiration = now()->addMinutes(5);

        foreach (['', ...$conversions] as $conversion) {
            $disk = Storage::disk($conversion === '' ? $media->disk : $media->conversions_disk);
            $chemin = $media->getPathRelativeToRoot($conversion);

            // `version_urls` : l'URL publique porte `?v=<updated_at>`, rien d'autre.
            $publique = $disk->url($chemin).'?v='.$media->updated_at->timestamp;

            $this->assertSame($publique, $media->getUrl($conversion), "getUrl({$conversion})");
            $this->assertSame(url($publique), $media->getFullUrl($conversion), "getFullUrl({$conversion})");
            $this->assertSame(
                $disk->temporaryUrl($chemin, $expiration),
                $media->getTemporaryUrl($expiration, $conversion),
                "getTemporaryUrl({$conversion})",
            );
            $this->assertStringStartsWith(RemoteDiskFake::PRESIGNED_HOST.'/', $media->getTemporaryUrl($expiration, $conversion));
        }
    }
}
