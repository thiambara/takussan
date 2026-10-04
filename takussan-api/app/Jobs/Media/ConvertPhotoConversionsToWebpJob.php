<?php

namespace App\Jobs\Media;

use App\Models\Property;
use App\Services\Media\PhotoConversionFormat;
use App\Services\Media\WatermarkTrace;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * Fait basculer UNE photo de bien antérieure au marqueur vers des conversions WebP (TCK-585,
 * ADR-0029, amendement du 2026-10-04, point 5). Mis en file par `media:convert-photos-to-webp`.
 *
 * Dans cet ordre :
 *
 *   1. SOUS VERROU de la ligne : marqueur posé, les conversions marquées NON produites et
 *      retirées des deux listes de la trace. Dès cet instant, `PublicPhotoUrl` n'émet plus
 *      aucune URL de la photo : aucune conversion n'est produite.
 *   2. Suppression des anciens fichiers, quand leur chemin diffère du nouveau (une source déjà
 *      en `.webp` donne le même nom, et la régénération l'écrasera).
 *   3. Régénération par le parent : `thumbnail` en ligne, `preview` et `full` en file, le
 *      filigrane à la fin de chaque conversion.
 *
 * **Pourquoi « non produites » en 1 et pas seulement le marqueur.** `getUrl()` calcule
 * l'extension depuis le marqueur : avec le marqueur seul, l'API émettrait des URL `.webp` sur des
 * fichiers pas encore écrits — le 404 que tout le dispositif existe pour éviter. Marquées non
 * produites, les conversions sont cachées, puis réapparaissent une à une, par le repli
 * `full → preview → thumbnail`. Et la trace vidée fait qu'une photo sous filigrane reste cachée
 * jusqu'à `ApplyWatermarkJob` : jamais un fichier nu.
 *
 * Le délai, les rejeux et l'échec définitif sont ceux du parent. Un rejeu après une tentative
 * tombée entre 1 et 3 trouve le marqueur posé : il saute la bascule et reprend la régénération.
 */
class ConvertPhotoConversionsToWebpJob extends RegeneratePhotoConversionsJob
{
    public function handle(): void
    {
        $media = Media::query()->find($this->mediaId);

        if ($media === null || ! PhotoConversionFormat::appliesTo($media)) {
            return;
        }

        if (PhotoConversionFormat::isWebp($media)) {
            if ($this->allGenerated($media)) {
                return;
            }
        } else {
            $this->switchFormat($media);
        }

        parent::handle();
    }

    private function switchFormat(Media $media): void
    {
        $conversions = Property::watermarkedConversions();
        $anciens = array_combine($conversions, array_map(fn (string $c) => $media->getPathRelativeToRoot($c), $conversions));

        $bascule = WatermarkTrace::underLock($this->mediaId, function (Media $fresh) use ($conversions) {
            if (PhotoConversionFormat::isWebp($fresh)) {
                return false;
            }

            $fresh->setCustomProperty(PhotoConversionFormat::KEY, PhotoConversionFormat::WEBP);

            foreach ([WatermarkTrace::KEY, WatermarkTrace::EXEMPT_KEY] as $key) {
                $fresh->setCustomProperty($key, array_values(array_diff($fresh->getCustomProperty($key, []), $conversions)));
            }

            $fresh->generated_conversions = array_merge($fresh->generated_conversions ?? [], array_fill_keys($conversions, false));
            $fresh->save();

            return true;
        });

        if (! $bascule) {
            return;
        }

        $media->refresh();
        $disk = Storage::disk($media->conversions_disk);

        foreach ($anciens as $conversion => $ancien) {
            if ($ancien !== $media->getPathRelativeToRoot($conversion)) {
                $disk->delete($ancien);
            }
        }
    }

    private function allGenerated(Media $media): bool
    {
        foreach (Property::watermarkedConversions() as $conversion) {
            if (! $media->hasGeneratedConversion($conversion)) {
                return false;
            }
        }

        return true;
    }
}
