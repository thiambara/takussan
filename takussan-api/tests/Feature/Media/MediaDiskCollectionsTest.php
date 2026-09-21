<?php

namespace Tests\Feature\Media;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Document;
use App\Models\Inventory;
use App\Models\KycDossier;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use Spatie\MediaLibrary\Conversions\Jobs\PerformConversionsJob;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\MediaCollections\MediaCollection;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

/**
 * TCK-538, ADR-0029 §3 — « la règle par défaut est privée ».
 *
 * Une collection est publique parce que son modèle la déclare telle
 * (`useDisk(config('media-library.public_disk_name'))`) ; toute autre tombe sur
 * `media-library.disk_name`, le disque privé. Jusqu'au 2026-09-21, le défaut
 * était `public` : pièces KYC, documents et pièces jointes y étaient servis
 * sans authentification, par identifiant séquentiel.
 */
class MediaDiskCollectionsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * La liste COMPLÈTE des collections déclarées, modèle par modèle, et leur
     * visibilité. Une collection neuve, une collection qui change de disque ou un
     * modèle neuf qui porte des médias font rougir le test : c'est ici qu'on
     * décide, par écrit, de ce qui est public.
     *
     * Décisions de TCK-538 (Notes du ticket) : `User.photos` et les photos
     * d'`Inventory` / `MaintenanceRequest` sont PRIVÉES — aucun écran public ne
     * les affiche.
     */
    private const EXPECTED = [
        Agency::class => ['logo' => 'public'],
        BankStatement::class => ['statement' => 'private'],
        Document::class => ['file' => 'private', 'versions' => 'private'],
        Inventory::class => ['photos' => 'private', 'room_photos' => 'private'],
        KycDossier::class => ['documents' => 'private'],
        Lease::class => ['lease_deposit_refund' => 'private'],
        MaintenanceRequest::class => ['photos' => 'private', 'completion_photos' => 'private', 'quotes' => 'private'],
        Message::class => ['attachments' => 'private'],
        // TCK-539 (D2) — l'original d'une photo est privé, ses conversions (filigranées) publiques.
        Property::class => ['photos' => 'private, conversions public', 'videos' => 'public', 'plans' => 'public'],
        User::class => ['avatar' => 'public', 'avatars' => 'public', 'photos' => 'private', 'documents' => 'private'],
    ];

    public function test_every_declared_collection_is_on_its_expected_disk(): void
    {
        // Des noms distincts de tout disque réel : une collection qui écrirait
        // `useDisk('public')` en dur se lit ici comme « autre », pas comme publique.
        config([
            'media-library.disk_name' => 'tck538-private',
            'media-library.public_disk_name' => 'tck538-public',
        ]);

        $actual = [];
        foreach ($this->modelsWithMedia() as $class) {
            $model = new $class;
            $model->registerMediaCollections();

            foreach ($model->mediaCollections as $collection) {
                /** @var MediaCollection $collection */
                $disk = fn (string $name, string $default) => match ($name) {
                    'tck538-public' => 'public',
                    'tck538-private' => 'private',
                    '' => $default,
                    default => "other disk [{$name}]",
                };

                $original = $disk($collection->diskName, 'private');
                // Spatie range les conversions sur le disque de l'original, sauf
                // `storeConversionsOnDisk()` : seul l'écart se lit ici.
                $conversions = $disk($collection->conversionsDiskName, $original);

                $actual[$class][$collection->name] = $conversions === $original
                    ? $original
                    : "{$original}, conversions {$conversions}";
            }
        }

        ksort($actual);
        $expected = self::EXPECTED;
        ksort($expected);

        $this->assertSame($expected, $actual);
    }

    public function test_an_undeclared_collection_lands_on_the_private_disk(): void
    {
        $private = config('media-library.disk_name');
        $public = config('media-library.public_disk_name');
        Storage::fake($private);
        Storage::fake($public);

        $media = User::factory()->create()
            ->addMedia(UploadedFile::fake()->create('note.pdf', 5, 'application/pdf'))
            ->toMediaCollection('tck538_never_declared');

        $this->assertNotSame($public, $private);
        $this->assertSame($private, $media->disk);
        $this->assertSame($private, $media->conversions_disk);
        Storage::disk($private)->assertExists($media->getPathRelativeToRoot());
        Storage::disk($public)->assertMissing($media->getPathRelativeToRoot());
    }

    /**
     * Ablation notée dans le ticket : `MEDIA_PRIVATE_DISK=public` — l'ancien défaut
     * — rend ce test ROUGE.
     */
    public function test_an_uploaded_kyc_document_is_not_on_the_public_disk(): void
    {
        $private = config('media-library.disk_name');
        $public = config('media-library.public_disk_name');
        Storage::fake($private);
        Storage::fake($public);

        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $this->postJson("/api/agencies/{$agency->id}/kyc/documents", [
            'document_type' => 'director_id',
            'document' => UploadedFile::fake()->create('cni.pdf', 10, 'application/pdf'),
        ])->assertCreated();

        $media = Media::query()->where('collection_name', 'documents')
            ->where('model_type', KycDossier::class)->sole();

        $this->assertSame($private, $media->disk);
        // Le disque public n'a RIEN reçu : `/storage/{id}/…` n'a aucun fichier à servir.
        $this->assertSame([], Storage::disk($public)->allFiles());
        Storage::disk($private)->assertExists($media->getPathRelativeToRoot());
    }

    /**
     * ADR-0029 §6 : une conversion régénérée change d'URL, le cache de Cloudflare
     * n'a rien à purger.
     */
    public function test_a_media_url_carries_its_version(): void
    {
        Storage::fake(config('media-library.public_disk_name'));

        $media = User::factory()->create()
            ->addMedia(UploadedFile::fake()->image('moi.jpg', 200, 200))
            ->toMediaCollection('avatar');

        $this->assertStringEndsWith('?v='.$media->updated_at->timestamp, $media->getUrl());
    }

    /**
     * Les conversions en file partent sur `media`, celle de `worker-media` — pas
     * sur `default`, derrière les notifications. Dépend de TCK-539, qui met
     * `preview` et `full` en file.
     */
    public function test_queued_conversions_go_to_the_media_queue(): void
    {
        Storage::fake(config('media-library.public_disk_name'));
        Queue::fake();

        User::factory()->create()
            ->addMedia(UploadedFile::fake()->image('moi.jpg', 200, 200))
            ->toMediaCollection('avatar');

        Queue::assertPushedOn('media', PerformConversionsJob::class);
    }

    /**
     * Dérivée, jamais recopiée : un modèle neuf qui porte des médias entre ici
     * sans qu'on y pense — et fait rougir le premier test tant qu'il n'est pas
     * dans EXPECTED.
     *
     * @return list<class-string<HasMedia>>
     */
    private function modelsWithMedia(): array
    {
        $classes = [];
        $root = app_path('Models');
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root));

        foreach ($files as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }

            $relative = substr($file->getPathname(), strlen($root) + 1, -4);
            $class = 'App\\Models\\'.str_replace('/', '\\', $relative);

            if (! class_exists($class) || ! is_subclass_of($class, HasMedia::class)) {
                continue;
            }

            if ((new ReflectionClass($class))->isAbstract()) {
                continue;
            }

            $classes[] = $class;
        }

        return $classes;
    }
}
