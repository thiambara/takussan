<?php

namespace App\Listeners\Media;

use App\Jobs\Media\ComputePhotoFingerprintJob;
use App\Models\Property;
use Spatie\MediaLibrary\MediaCollections\Events\MediaHasBeenAddedEvent;

/**
 * TCK-597 (ADR-0054 §1) — une photo ajoutée à un bien part en empreinte sur la file `media`.
 * Découvert par le framework (`handle` + premier paramètre typé) : ne pas l'inscrire à la main.
 */
class FingerprintAddedPhotoListener
{
    public function handle(MediaHasBeenAddedEvent $event): void
    {
        $media = $event->media;

        if ($media->model_type === Property::class && $media->collection_name === 'photos') {
            ComputePhotoFingerprintJob::dispatch($media->id);
        }
    }
}
