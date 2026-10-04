<?php

namespace App\Jobs\Media;

use App\Models\Property;
use App\Services\Media\PhotoConversionFormat;
use App\Services\Media\WatermarkTrace;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\Conversions\Conversion;
use Spatie\MediaLibrary\Conversions\ConversionCollection;
use Spatie\MediaLibrary\Conversions\FileManipulator;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

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
 *   3. Les trois conversions produites ET filigranées DANS ce job, de façon synchrone.
 *
 * **Pourquoi « non produites » en 1 et pas seulement le marqueur.** `getUrl()` calcule
 * l'extension depuis le marqueur : avec le marqueur seul, l'API émettrait des URL `.webp` sur des
 * fichiers pas encore écrits — le 404 que tout le dispositif existe pour éviter. Marquées non
 * produites, les conversions sont cachées, puis réapparaissent une à une, par le repli
 * `full → preview → thumbnail`. Et la trace vidée fait qu'une photo sous filigrane reste cachée
 * jusqu'à `ApplyWatermarkJob` : jamais un fichier nu.
 *
 * **Pourquoi tout dans ce job, et non `thumbnail` en ligne et le reste en file comme à l'envoi.**
 * Mesuré en préproduction le 2026-10-04 : les 858 biens exigent le filigrane. La première version
 * déléguait au parent (`createDerivedFiles()`) : `preview`, `full` et chaque `ApplyWatermarkJob`
 * partaient en file DERRIÈRE les 3 446 autres bascules. Une photo basculée restait cachée jusqu'à
 * ce que la file y arrive, soit environ une heure : 71 photos sur 72 étaient cachées après une
 * minute, et les bascules restantes ont été retirées de la file. Une file remplie d'un coup ne
 * sert pas ce qui y est ajouté ensuite. Le job ne peut donc rien y laisser dont sa photo dépend.
 * Les `ApplyWatermarkJob` que l'écouteur met en file à chaque conversion sortent ensuite sans rien
 * faire : la trace les dit déjà faits.
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

        $media = $media->fresh();
        $conversions = ConversionCollection::createForMedia($media)
            ->filter(fn (Conversion $conversion) => $conversion->shouldBePerformedOn($media->collection_name));

        try {
            app(FileManipulator::class)->performConversions($conversions, $media);
        } catch (Throwable $exception) {
            WatermarkTrace::failClosed($media, Property::watermarkedConversions(), $exception, 'ConvertPhotoConversionsToWebpJob');

            throw $exception;
        }

        // Sans effet si le bien n'exige pas de filigrane : `ApplyWatermarkJob` le vérifie lui-même.
        // `handle()` appelé ici, et non `dispatchSync()`, qui passe encore par le gestionnaire de
        // files : le filigrane ne doit dépendre d'aucune file.
        foreach (Property::watermarkedConversions() as $conversion) {
            app()->call([new ApplyWatermarkJob($this->mediaId, $conversion), 'handle']);
        }
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
