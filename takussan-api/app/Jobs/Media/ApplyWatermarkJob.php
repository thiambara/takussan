<?php

namespace App\Jobs\Media;

use App\Models\Property;
use App\Services\Media\AgencyWatermarkContext;
use App\Services\Media\WatermarkService;
use App\Services\Media\WatermarkTrace;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Spatie\MediaLibrary\MediaCollections\Filesystem;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Spatie\MediaLibrary\Support\TemporaryDirectory;
use Throwable;

class ApplyWatermarkJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [10, 30, 120];

    public function __construct(
        public readonly int $mediaId,
        public readonly string $conversionName,
    ) {
        $this->onQueue('media');
    }

    public function handle(WatermarkService $service): void
    {
        $media = Media::find($this->mediaId);

        if ($media === null) {
            return;
        }

        if ($media->model_type !== Property::class || $media->collection_name !== 'photos') {
            return;
        }

        $property = $media->model;

        if (! $property instanceof Property) {
            return;
        }

        if (! $property->requiresWatermark()) {
            return;
        }

        $context = AgencyWatermarkContext::fromAgency($property->agency);

        // Tout le reste SOUS VERROU de la ligne, relue fraîche (`WatermarkTrace`) : deux jobs
        // de la même conversion (plusieurs processus `worker-media`) ne peuvent plus lire tous
        // deux « pas encore fait » et filigraner deux fois ; et l'ajout à la trace ne réécrit
        // pas une liste périmée par-dessus le retrait qu'a fait, entre-temps, une régénération.
        WatermarkTrace::underLock($this->mediaId, fn (Media $media) => $this->watermark($media, $service, $context));
    }

    private function watermark(Media $media, WatermarkService $service, AgencyWatermarkContext $context): void
    {
        $watermarkedConversions = $media->getCustomProperty(WatermarkTrace::KEY, []);

        if (in_array($this->conversionName, $watermarkedConversions, true)) {
            return;
        }

        // TCK-539 — la conversion se lit PAR SON DISQUE, jamais par `getPath()` : sur R2
        // (`r2-media`) ce chemin local n'existe pas, `file_exists()` rendait faux, et le job
        // sortait sans rien dire en laissant la conversion NUE sur la surface publique.
        $disk = Storage::disk($media->conversions_disk);
        $relativePath = $media->getPathRelativeToRoot($this->conversionName);

        if (! $disk->exists($relativePath)) {
            return;
        }

        // L'encodeur se choisit d'après l'extension : le fichier temporaire garde le nom
        // de la conversion. Même répertoire temporaire que les conversions de Spatie.
        $temporaryDirectory = TemporaryDirectory::create();

        try {
            $localPath = $temporaryDirectory->path(basename($relativePath));

            $this->download($disk->readStream($relativePath), $localPath);

            $service->apply($localPath, $context);

            // Réécrite au MÊME chemin, sur le MÊME disque, par l'écrivain de Spatie : mêmes
            // en-têtes (`ContentType`, `CacheControl` de `media-library.remote.extra_headers`)
            // et même visibilité (celle du disque) que la conversion qu'elle remplace.
            app(Filesystem::class)->copyToMediaLibrary($localPath, $media, 'conversions', basename($relativePath));
        } finally {
            $temporaryDirectory->delete();
        }

        $watermarkedConversions[] = $this->conversionName;
        $media->setCustomProperty(WatermarkTrace::KEY, $watermarkedConversions);
        $media->updated_at = $this->nextVersion($media->updated_at);
        $media->save();
    }

    /**
     * Échec DÉFINITIF (trois essais) : la conversion reste cachée — le parti fail-closed ne
     * change pas —, mais plus en silence (R1 de la seconde passe adverse). Sans ce signal, une
     * photo disparaissait de la fiche sans qu'aucun journal ne le dise.
     */
    public function failed(?Throwable $exception): void
    {
        $media = Media::query()->find($this->mediaId);

        Log::error('[ApplyWatermarkJob] Filigrane abandonné : la conversion reste cachée du public.', [
            'media_id' => $this->mediaId,
            'property_id' => $media?->model_type === Property::class ? $media->model_id : null,
            'conversion' => $this->conversionName,
            'exception' => $exception?->getMessage(),
        ]);
    }

    /**
     * @param  resource|null  $stream
     */
    private function download($stream, string $localPath): void
    {
        if (! is_resource($stream)) {
            throw new RuntimeException("Conversion illisible sur son disque : media {$this->mediaId}, {$this->conversionName}.");
        }

        $target = fopen($localPath, 'wb');

        try {
            stream_copy_to_stream($stream, $target);
        } finally {
            fclose($target);
            fclose($stream);
        }
    }

    /**
     * Le `updated_at` de la réécriture, STRICTEMENT postérieur à celui qu'on a lu (ADR-0029 §6).
     *
     * L'URL publique porte `?v=<updated_at>` À LA SECONDE, et Cloudflare la met en cache. La
     * conversion NUE est adressable entre son écriture et ce job : si elle a été servie — donc
     * mise en cache — et que le filigrane est posé dans la même seconde, un simple `save()`
     * rendrait la même URL, et le cache continuerait de servir l'image sans filigrane.
     */
    private function nextVersion(?CarbonInterface $current): CarbonInterface
    {
        $now = now();

        if ($current === null || $now->getTimestamp() > $current->getTimestamp()) {
            return $now;
        }

        return $current->copy()->addSecond();
    }
}
