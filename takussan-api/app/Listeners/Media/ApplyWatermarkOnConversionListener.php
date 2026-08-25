<?php

namespace App\Listeners\Media;

use App\Jobs\Media\ApplyWatermarkJob;
use App\Models\Property;
use App\Services\Media\AgencyWatermarkContext;
use Illuminate\Contracts\Queue\ShouldQueue;
use Spatie\MediaLibrary\Conversions\Events\ConversionHasBeenCompletedEvent;

class ApplyWatermarkOnConversionListener implements ShouldQueue
{
    public string $queue = 'media';

    public function handle(ConversionHasBeenCompletedEvent $event): void
    {
        $media = $event->media;
        $conversion = $event->conversion;

        if ($media->model_type !== Property::class) {
            return;
        }

        if ($media->collection_name !== 'photos') {
            return;
        }

        if (! in_array($conversion->getName(), Property::watermarkedConversions(), true)) {
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

        ApplyWatermarkJob::dispatch($media->id, $conversion->getName());
    }
}
