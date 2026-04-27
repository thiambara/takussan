<?php

namespace App\Jobs\Media;

use App\Models\Property;
use App\Services\Media\AgencyWatermarkContext;
use App\Services\Media\WatermarkService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

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

        $agency = $property->agency;

        if ($agency === null) {
            return;
        }

        $watermarkEnabled = $agency->settings['watermark_enabled'] ?? AgencyWatermarkContext::defaults()['watermark_enabled'];

        if (! $watermarkEnabled) {
            return;
        }

        $watermarkedConversions = $media->getCustomProperty('watermarked_conversions', []);

        if (in_array($this->conversionName, $watermarkedConversions, true)) {
            return;
        }

        $path = $media->getPath($this->conversionName);

        if (! file_exists($path)) {
            return;
        }

        $context = AgencyWatermarkContext::fromAgency($agency);
        $service->apply($path, $context);

        $watermarkedConversions[] = $this->conversionName;
        $media->setCustomProperty('watermarked_conversions', $watermarkedConversions);
        $media->save();
    }
}
