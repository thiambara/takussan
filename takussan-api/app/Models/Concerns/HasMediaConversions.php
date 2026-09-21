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
 * `thumbnail` est synchrone, `preview` et `full` partent en file `media` (TCK-539) :
 * sur R2, chaque conversion synchrone ajoute un encodage et une écriture distante à la
 * requête d'upload. Aucun écran ne lit `preview` ni `full` à la sortie de l'upload —
 * `MediaResource` rend `null` pour une conversion pas encore produite, et les avatars
 * sont servis en original (`getFirstMediaUrl('avatar')`).
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
            ->queued();

        $this->addMediaConversion('full')
            ->width(1200)
            ->queued();
    }
}
