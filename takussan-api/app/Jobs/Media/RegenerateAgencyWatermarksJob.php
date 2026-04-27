<?php

namespace App\Jobs\Media;

use App\Models\Agency;
use App\Models\Property;
use App\Services\Media\AgencyWatermarkContext;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Artisan;

class RegenerateAgencyWatermarksJob implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly int $agencyId,
    ) {
        $this->onQueue('media');
    }

    public function handle(): void
    {
        $agency = Agency::find($this->agencyId);

        if ($agency === null) {
            return;
        }

        $watermarkEnabled = $agency->settings['watermark_enabled'] ?? AgencyWatermarkContext::defaults()['watermark_enabled'];

        Property::where('agency_id', $this->agencyId)->cursor()->each(function (Property $property) use ($watermarkEnabled) {
            foreach ($property->getMedia('photos') as $media) {
                $media->setCustomProperty('watermarked_conversions', []);
                $media->save();

                Artisan::call('media-library:regenerate', [
                    '--ids' => (string) $media->id,
                    '--force' => true,
                ]);

                if ($watermarkEnabled) {
                    foreach (['thumbnail', 'preview'] as $conversion) {
                        ApplyWatermarkJob::dispatch($media->id, $conversion);
                    }
                }
            }
        });
    }
}
