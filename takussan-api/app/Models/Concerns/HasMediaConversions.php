<?php

namespace App\Models\Concerns;

use Spatie\Image\Enums\Fit;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * Registers the three standard image conversions used across the app:
 * `thumbnail` (150x150), `preview` (400x400) and `full` (1200xauto).
 *
 * Models using this trait must also implement `HasMedia` + `InteractsWithMedia`
 * and register their own collections via `registerMediaCollections()`.
 * Only image media will generate conversions (Spatie skips non-images).
 *
 * Conversions are generated non-queued to match the ticket requirement
 * "Conversions générées à l'upload (pas deferred)".
 */
trait HasMediaConversions
{
    public function registerMediaConversions(?Media $media = null): void
    {
        $this->addMediaConversion('thumbnail')
            ->fit(Fit::Crop, 150, 150)
            ->nonQueued();

        $this->addMediaConversion('preview')
            ->fit(Fit::Contain, 400, 400)
            ->nonQueued();

        $this->addMediaConversion('full')
            ->width(1200)
            ->nonQueued();
    }
}
