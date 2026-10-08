<?php

namespace App\Jobs\Media;

use App\Models\MediaFingerprint;
use App\Models\Property;
use App\Services\Moderation\DuplicateListingDetector;
use App\Support\PhotoFingerprint;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-597 (ADR-0054 §1) — l'empreinte dHash d'une photo de bien, calculée sur l'ORIGINAL, puis la
 * recherche de doublons (photo et adresse).
 *
 * L'original se lit PAR SON DISQUE, jamais par `getPath()` : sur R2 ce chemin local n'existe pas
 * (TCK-539). Un fichier qui ne se décode pas n'a pas d'empreinte et ne fait pas échouer le job.
 */
class ComputePhotoFingerprintJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [10, 30, 120];

    public function __construct(public readonly int $mediaId)
    {
        $this->onQueue('media');
    }

    public function handle(DuplicateListingDetector $detector): void
    {
        $media = Media::query()->find($this->mediaId);
        if ($media === null || $media->model_type !== Property::class || $media->collection_name !== 'photos') {
            return;
        }

        $property = Property::query()->find($media->model_id);
        if ($property === null) {
            return;
        }

        $disk = Storage::disk($media->disk);
        $path = $media->getPathRelativeToRoot();
        $hash = $disk->exists($path) ? PhotoFingerprint::fromBinary((string) $disk->get($path)) : null;

        if ($hash === null) {
            Log::warning('[ComputePhotoFingerprintJob] Original illisible : pas d\'empreinte.', [
                'media_id' => $media->id,
                'property_id' => $property->id,
                'mime_type' => $media->mime_type,
            ]);

            return;
        }

        [$b0, $b1, $b2, $b3] = PhotoFingerprint::bands($hash);
        $fingerprint = MediaFingerprint::query()->updateOrCreate(
            ['media_id' => $media->id],
            [
                'property_id' => $property->id,
                'agency_id' => $property->agency_id,
                'hash' => $hash,
                'band_0' => $b0,
                'band_1' => $b1,
                'band_2' => $b2,
                'band_3' => $b3,
            ],
        );

        $detector->detectForPhoto($fingerprint);
        $detector->detectByAddress($property);
    }
}
