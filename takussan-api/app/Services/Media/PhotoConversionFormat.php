<?php

namespace App\Services\Media;

use App\Models\Property;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * Le format des conversions d'une photo de bien, décidé PAR MÉDIA (TCK-585, ADR-0029,
 * amendement du 2026-10-04, point 4).
 *
 * `getUrl($conversion)` calcule l'extension depuis la conversion DÉCLARÉE
 * (`Conversion::getResultExtension()`), jamais depuis le fichier présent sur le disque. Déclarer
 * `->format('webp')` pour tout le parc d'un coup aurait donc rendu, dès le déploiement, une URL
 * `.webp` sur chaque conversion encore écrite en `.jpg` : un 404 sur toutes les photos existantes,
 * jusqu'à leur régénération.
 *
 * D'où un marqueur dans `custom_properties`, lu par `Property::registerMediaConversions()` — que
 * Spatie appelle avec le média, à la génération comme au calcul d'URL. Les deux lisent la même
 * règle sur la même ligne : ils ne peuvent pas diverger.
 *
 * - Une photo NEUVE reçoit le marqueur à sa création (`Media::creating`, câblé dans
 *   `AppServiceProvider`), donc avant sa première conversion.
 * - Une photo ANCIENNE n'en a pas : ses conversions restent dans le format de la source, sur des
 *   fichiers qui existent. `ConvertPhotoConversionsToWebpJob` la fait basculer, photo par photo.
 */
final class PhotoConversionFormat
{
    public const KEY = 'conversions_format';

    public const WEBP = 'webp';

    /**
     * Qualité de l'encodage WebP. Celle de la mesure de l'amendement (38 Ko pour une `preview`
     * de 800 × 600), et celle que le front demandait à Transformations (`QUALITE_MEDIA`). Sans
     * elle, le pilote GD de `spatie/image` passe -1 à `imagewebp()`, soit 80 côté libwebp.
     */
    public const QUALITY = 75;

    /** Une photo de bien : la seule collection dont les conversions sont servies au public en WebP. */
    public static function appliesTo(Media $media): bool
    {
        return $media->model_type === Property::class && $media->collection_name === 'photos';
    }

    /** Pose le marqueur sur une photo qui va être créée. Sans effet sur toute autre collection. */
    public static function markNew(Media $media): void
    {
        if (self::appliesTo($media) && ! $media->hasCustomProperty(self::KEY)) {
            $media->setCustomProperty(self::KEY, self::WEBP);
        }
    }

    /**
     * `null` rend `false` : sans média, rien ne dit que ses fichiers sont en WebP, et c'est le
     * format de la source qui est sûr.
     */
    public static function isWebp(?Media $media): bool
    {
        return $media?->getCustomProperty(self::KEY) === self::WEBP;
    }
}
