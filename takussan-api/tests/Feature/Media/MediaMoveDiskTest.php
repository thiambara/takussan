<?php

namespace Tests\Feature\Media;

use App\Models\Agency;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * `media:move-disk` — TCK-538, la copie des médias existants vers R2 (TCK-541).
 * Éprouvée de `local` vers un disque distant simulé (`RemoteDiskFake`) nommé comme en production.
 */
class MediaMoveDiskTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // L'état d'une migration : la configuration vise DÉJÀ les seaux (`install()` branche
        // `r2-private` en disque privé, `r2-media` en disque public), les lignes sont encore sur
        // les disques locaux d'avant. Disques DISTANTS simulés, pas `Storage::fake('r2-…')` : leur
        // `path()` est relatif comme sur S3, la commande doit passer par les flux.
        Storage::fake('local');
        Storage::fake('public');
        RemoteDiskFake::install('r2-private');
        RemoteDiskFake::install('r2-media');
    }

    public function test_it_copies_original_conversions_and_responsive_images_and_switches_the_row(): void
    {
        $media = $this->mediaWithDerivedFiles('documents');
        $files = $this->filesOf($media);

        $this->artisan('media:move-disk', ['from' => 'local', 'to' => 'r2-private'])
            ->expectsOutputToContain('moved 1 media (3 file(s))')
            ->assertSuccessful();

        $media->refresh();
        $this->assertSame('r2-private', $media->disk);
        $this->assertSame('r2-private', $media->conversions_disk);

        foreach ($files as $path => $content) {
            $this->assertSame($content, Storage::disk('r2-private')->get($path), $path);
            // Sans `--delete-source`, la source reste intacte.
            Storage::disk('local')->assertExists($path);
        }
    }

    public function test_it_is_idempotent_and_skips_media_already_on_the_target(): void
    {
        $this->mediaWithDerivedFiles('documents');

        $this->artisan('media:move-disk', ['from' => 'local', 'to' => 'r2-private'])->assertSuccessful();

        $this->artisan('media:move-disk', ['from' => 'local', 'to' => 'r2-private'])
            ->expectsOutputToContain('moved 0 media (0 file(s)), skipped 1 already on r2-private')
            ->assertSuccessful();
    }

    public function test_dry_run_writes_nothing(): void
    {
        $media = $this->mediaWithDerivedFiles('documents');

        $this->artisan('media:move-disk', ['from' => 'local', 'to' => 'r2-private', '--dry-run' => true])
            ->expectsOutputToContain('would move 1 media (3 file(s))')
            ->assertSuccessful();

        $this->assertSame('local', $media->refresh()->disk);
        $this->assertSame([], Storage::disk('r2-private')->allFiles());
    }

    public function test_collection_filter_moves_only_the_named_collections(): void
    {
        $kept = $this->mediaWithDerivedFiles('photos');
        $moved = $this->mediaWithDerivedFiles('documents');

        $this->artisan('media:move-disk', [
            'from' => 'local', 'to' => 'r2-private', '--collection' => ['documents'],
        ])->assertSuccessful();

        $this->assertSame('r2-private', $moved->refresh()->disk);
        $this->assertSame('local', $kept->refresh()->disk);
        Storage::disk('r2-private')->assertMissing($kept->getPathRelativeToRoot());
    }

    public function test_delete_source_removes_the_source_files_after_the_switch(): void
    {
        $media = $this->mediaWithDerivedFiles('documents');
        $files = $this->filesOf($media);

        $this->artisan('media:move-disk', [
            'from' => 'local', 'to' => 'r2-private', '--delete-source' => true,
        ])->assertSuccessful();

        foreach (array_keys($files) as $path) {
            Storage::disk('local')->assertMissing($path);
            Storage::disk('r2-private')->assertExists($path);
        }
    }

    public function test_a_missing_source_file_leaves_the_row_on_its_disk_and_fails(): void
    {
        $media = $this->mediaWithDerivedFiles('documents');
        Storage::disk('local')->delete($media->getPathRelativeToRoot());

        $this->artisan('media:move-disk', ['from' => 'local', 'to' => 'r2-private'])
            ->expectsOutputToContain('1 failed')
            ->assertFailed();

        $this->assertSame('local', $media->refresh()->disk);
    }

    public function test_an_unknown_disk_is_refused(): void
    {
        $this->artisan('media:move-disk', ['from' => 'local', 'to' => 'nope-disk'])
            ->expectsOutputToContain('disk [nope-disk] is not configured')
            ->assertFailed();
    }

    /**
     * D-1 (TCK-538). Le runbook d'origine : « `public → r2-media`, puis les privées vers
     * `r2-private` ». Sans `--collection`, la première commande prenait TOUT `public` — pièces KYC
     * comprises — et les rangeait dans le seau PUBLIC. Elle doit désormais refuser, sans rien écrire.
     */
    public function test_the_faulty_runbook_is_refused_before_any_write(): void
    {
        $kyc = $this->kycOnPublic();
        $avatar = $this->mediaWithDerivedFiles('avatar', disk: 'public');

        $this->artisan('media:move-disk', ['from' => 'public', 'to' => 'r2-media'])
            ->expectsOutputToContain('1 row(s) refused — nothing was written')
            ->expectsOutputToContain("#{$kyc->id} ".KycDossier::class.'::documents — original declared on [r2-private]')
            ->assertFailed();

        $this->assertSame([], Storage::disk('r2-media')->allFiles());
        $this->assertSame([], Storage::disk('r2-private')->allFiles());
        $this->assertSame('public', $kyc->refresh()->disk);
        $this->assertSame('public', $avatar->refresh()->disk);
    }

    public function test_force_moves_against_the_declaration(): void
    {
        $kyc = $this->kycOnPublic();

        $this->artisan('media:move-disk', ['from' => 'public', 'to' => 'r2-media', '--force' => true])
            ->assertSuccessful();

        $this->assertSame('r2-media', $kyc->refresh()->disk);
    }

    /**
     * `--to-declared` : chaque ligne part vers le disque que SON modèle déclare pour SA
     * collection — l'original et les conversions séparément.
     */
    public function test_to_declared_sends_each_part_of_each_row_to_its_declared_disk(): void
    {
        $kyc = $this->kycOnPublic();
        $avatar = $this->mediaWithDerivedFiles('avatar', disk: 'public');
        $avatarFiles = $this->filesOf($avatar, 'public');

        // Original PRIVÉ, conversions PUBLIQUES (`storeConversionsOnDisk`) : la forme que prend
        // `Property.photos` (TCK-539). Le modèle de test la déclare lui-même, pour que l'épreuve
        // ne dépende pas de l'état d'un autre chantier.
        $split = $this->mediaWithDerivedFiles('photos', disk: 'public');
        $split->forceFill(['model_type' => MoveDiskSplitDisksModel::class])->saveQuietly();
        $base = $split->getKey();

        $this->artisan('media:move-disk', ['from' => 'public', '--to-declared' => true])
            ->expectsOutputToContain('moved 3 media')
            ->assertSuccessful();

        // Le KYC : dans le seau PRIVÉ, et rien de lui dans le public.
        $this->assertSame(['r2-private', 'r2-private'], [$kyc->refresh()->disk, $kyc->conversions_disk]);
        Storage::disk('r2-private')->assertExists($kyc->getPathRelativeToRoot());
        $this->assertSame([], Storage::disk('r2-media')->allFiles((string) $kyc->id));

        // L'avatar : public, conversions comprises.
        $this->assertSame(['r2-media', 'r2-media'], [$avatar->refresh()->disk, $avatar->conversions_disk]);
        foreach ($avatarFiles as $path => $content) {
            $this->assertSame($content, Storage::disk('r2-media')->get($path), $path);
        }

        // Le partage : original → privé, conversions et responsives → public.
        $this->assertSame(['r2-private', 'r2-media'], [$split->refresh()->disk, $split->conversions_disk]);
        Storage::disk('r2-private')->assertExists("{$base}/piece.pdf");
        Storage::disk('r2-media')->assertMissing("{$base}/piece.pdf");
        Storage::disk('r2-media')->assertExists("{$base}/conversions/piece-thumbnail.jpg");
        Storage::disk('r2-media')->assertExists("{$base}/responsive-images/piece___media_library_original_320_240.jpg");
        $this->assertSame([], Storage::disk('r2-private')->allFiles("{$base}/conversions"));

        // Idempotente : le second passage ne trouve plus rien sur `public` à déplacer.
        $this->artisan('media:move-disk', ['from' => 'public', '--to-declared' => true])
            ->expectsOutputToContain('moved 0 media')
            ->assertSuccessful();
    }

    /**
     * Le cas de TCK-541 relevé par tck539b : une photo déjà entière sur `r2-media`, dont le modèle
     * déclare désormais l'original PRIVÉ. Seul l'original part ; les conversions, déjà sur leur
     * disque déclaré, restent — et la trace du filigrane (`custom_properties`) survit : on copie
     * des octets, on ne régénère rien.
     */
    public function test_to_declared_moves_only_the_part_that_is_off_its_declared_disk(): void
    {
        $split = $this->mediaWithDerivedFiles('photos', disk: 'r2-media');
        $split->forceFill([
            'model_type' => MoveDiskSplitDisksModel::class,
            'custom_properties' => ['watermarked_conversions' => ['thumbnail']],
        ])->saveQuietly();
        $base = $split->getKey();

        $this->artisan('media:move-disk', ['from' => 'r2-media', '--to-declared' => true, '--delete-source' => true])
            ->expectsOutputToContain('moved 1 media (1 file(s))')
            ->assertSuccessful();

        $split->refresh();
        $this->assertSame(['r2-private', 'r2-media'], [$split->disk, $split->conversions_disk]);
        $this->assertSame(['thumbnail'], $split->getCustomProperty('watermarked_conversions'));
        Storage::disk('r2-private')->assertExists("{$base}/piece.pdf");
        Storage::disk('r2-media')->assertMissing("{$base}/piece.pdf");
        Storage::disk('r2-media')->assertExists("{$base}/conversions/piece-thumbnail.jpg");
    }

    /**
     * Mission 5 — le VRAI `Property.photos` (original privé, conversions publiques, TCK-539 D2),
     * depuis l'état d'avant la bascule : tout sur `public`. Après la commande, la fiche publique
     * rend un `full` dont le fichier existe sur `r2-media`, et l'original n'y est plus.
     */
    public function test_to_declared_splits_a_real_property_photo_and_the_api_serves_it(): void
    {
        [$property, $media] = $this->propertyPhotoOnPublic();

        $this->artisan('media:move-disk', ['from' => 'public', '--to-declared' => true, '--delete-source' => true])
            ->assertSuccessful();

        $media->refresh();
        $this->assertSame(['r2-private', 'r2-media'], [$media->disk, $media->conversions_disk]);
        Storage::disk('r2-private')->assertExists($media->getPathRelativeToRoot());
        Storage::disk('r2-media')->assertMissing($media->getPathRelativeToRoot());
        Storage::disk('public')->assertMissing($media->getPathRelativeToRoot('full'));

        $full = $this->getJson('/api/public/properties/'.$property->slug)->assertOk()->json('data.photos.0.full');
        $this->assertSame($media->getUrl('full'), $full);
        Storage::disk('r2-media')->assertExists($media->getPathRelativeToRoot('full'));
    }

    /**
     * C1 (passe adverse 2) — en mode explicite, le refus porte AUSSI sur le disque déclaré des
     * CONVERSIONS. `public → r2-private` convient à l'original d'une photo de bien, pas à ses
     * conversions (déclarées sur `r2-media`) : sans ce refus, les images publiques du site
     * partiraient dans le seau privé, et `full` rendrait un 404.
     */
    public function test_explicit_mode_refuses_conversions_declared_on_another_disk(): void
    {
        [, $media] = $this->propertyPhotoOnPublic();

        $this->artisan('media:move-disk', ['from' => 'public', 'to' => 'r2-private'])
            ->expectsOutputToContain('1 row(s) refused — nothing was written')
            ->expectsOutputToContain("#{$media->id} ".Property::class.'::photos — conversions declared on [r2-media], not [r2-private]')
            ->assertFailed();

        $this->assertSame(['public', 'public'], [$media->refresh()->disk, $media->conversions_disk]);
        $this->assertSame([], Storage::disk('r2-private')->allFiles());
        $this->assertSame([], Storage::disk('r2-media')->allFiles());
    }

    public function test_to_and_to_declared_are_exclusive(): void
    {
        $this->artisan('media:move-disk', ['from' => 'public', 'to' => 'r2-media', '--to-declared' => true])
            ->assertFailed();
        $this->artisan('media:move-disk', ['from' => 'public'])
            ->assertFailed();
    }

    /**
     * Le VRAI `Property.photos`, dans l'état d'avant la bascule : original ET conversions sur
     * `public`. La configuration est ensuite rendue aux seaux, comme pendant la migration.
     *
     * @return array{0: Property, 1: Media}
     */
    private function propertyPhotoOnPublic(): array
    {
        config(['media-library.disk_name' => 'public', 'media-library.public_disk_name' => 'public']);
        $property = Property::factory()->published()->create();
        $media = $property->addMedia(UploadedFile::fake()->image('villa.jpg', 2000, 1500))
            ->toMediaCollection('photos')
            ->refresh();
        $this->assertSame(['public', 'public'], [$media->disk, $media->conversions_disk]);
        $this->assertTrue($media->hasGeneratedConversion('full'));
        config(['media-library.disk_name' => 'r2-private', 'media-library.public_disk_name' => 'r2-media']);

        return [$property, $media];
    }

    private function kycOnPublic(): Media
    {
        $dossier = KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => Agency::factory()->create()->id,
            'status' => KycDossierStatus::Pending,
        ]);

        return $dossier->addMedia(UploadedFile::fake()->create('cni.pdf', 3, 'application/pdf'))
            ->toMediaCollection('documents', 'public');
    }

    /**
     * Un média privé et, à côté de son original, une conversion et une image
     * responsive écrites à leur place : la commande doit les trouver par
     * listage, quel que soit leur nom.
     */
    private function mediaWithDerivedFiles(string $collection, ?HasMedia $owner = null, string $disk = 'local'): Media
    {
        $media = ($owner ?? User::factory()->create())
            ->addMedia(UploadedFile::fake()->create('piece.pdf', 3, 'application/pdf'))
            ->toMediaCollection($collection, $disk);

        $base = $media->getKey();
        Storage::disk($disk)->put("{$base}/conversions/piece-thumbnail.jpg", "thumb-{$base}");
        Storage::disk($disk)->put("{$base}/responsive-images/piece___media_library_original_320_240.jpg", "resp-{$base}");

        return $media;
    }

    /** @return array<string, string> chemin → contenu, sur le disque source */
    private function filesOf(Media $media, string $from = 'local'): array
    {
        $disk = Storage::disk($from);

        return collect($disk->allFiles((string) $media->getKey()))
            ->mapWithKeys(fn (string $path) => [$path => $disk->get($path)])
            ->all();
    }
}

/**
 * Un modèle qui déclare un original PRIVÉ et des conversions PUBLIQUES — la forme de
 * `Property.photos` après TCK-539. Jamais persisté : `media:move-disk` ne fait que
 * l'instancier pour lire ses déclarations.
 */
class MoveDiskSplitDisksModel extends Model implements HasMedia
{
    use InteractsWithMedia;

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('photos')
            ->useDisk(config('media-library.disk_name'))
            ->storeConversionsOnDisk(config('media-library.public_disk_name'));
    }
}
