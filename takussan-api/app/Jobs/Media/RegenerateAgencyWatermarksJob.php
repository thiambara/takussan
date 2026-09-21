<?php

namespace App\Jobs\Media;

use App\Models\Agency;
use App\Models\Property;
use App\Services\Media\AgencyWatermarkContext;
use App\Services\Media\WatermarkTrace;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\LazyCollection;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

/**
 * Fait réécrire les conversions de `photos` de toutes les propriétés d'une agence depuis la
 * source, pour que le filigrane suive un changement de logo, de position, d'opacité ou
 * d'activation. Le travail lui-même est fait photo par photo, par `RegeneratePhotoConversionsJob`.
 *
 * ⚠ **Le filigrane n'est PAS redéposé ici, et c'est délibéré (TCK-539).** Il l'était, par un
 * `ApplyWatermarkJob` par conversion envoyé juste après `media-library:regenerate`. Ça ne tenait
 * que tant que TOUTES les conversions étaient synchrones. `preview` et `full` passent en file
 * (`Property::registerMediaConversions()`) : le job envoyé ici pouvait alors tourner AVANT le
 * `PerformConversionsJob`, filigraner l'ANCIEN fichier — déjà filigrané, donc deux fois — et le
 * marquer ; la conversion réécrivait ensuite un fichier nu, que le job suivant sautait puisque
 * la trace le disait fait. Résultat : une conversion publique sans filigrane.
 *
 * Le seul moment où l'on sait qu'une conversion est fraîche est l'événement
 * `ConversionHasBeenCompletedEvent`, synchrone ou en file : `ApplyWatermarkOnConversionListener`
 * l'écoute, vérifie l'activation, et envoie le job.
 *
 * ⚠ **La trace n'est PAS purgée en bloc ici (TCK-539, mission 5).** Elle l'était, avant
 * `media-library:regenerate` : toutes les photos de l'agence cessaient alors d'être servables
 * (`PublicPhotoUrl::isServable()`) et disparaissaient du site public pendant TOUTE la
 * régénération — des minutes pour une grosse agence. Le listener retire désormais chaque
 * conversion de la trace au moment où SON fichier va être réécrit (`ConversionWillStartEvent`) :
 * une photo n'est cachée que pendant sa propre fenêtre, les autres restent servies filigranées.
 *
 * ⚠ **Pas de `media-library:regenerate` (quatrième passe adverse, R1a).** La commande de Spatie
 * attrape toute `Exception` média par média, l'affiche en `warn` et rend 0 : une source illisible
 * sur `r2-private` disparaissait sans journal, et l'exemption survivait. Chaque photo passe par
 * `FileManipulator` dans `RegeneratePhotoConversionsJob`, qui retire ses exemptions en cas d'échec.
 *
 * ⚠ **Ce job ne régénère plus rien : il répartit (cinquième passe adverse, V5-1).** Il faisait
 * tout le travail, sans délai propre. Au délai du worker, le processus était tué, chaque rejeu
 * repartait du premier bien, et une agence trop longue à régénérer ne finissait jamais. Au dernier
 * rejeu, `failed()` était appelé sans que `handle()` ait retiré une seule exemption : les photos
 * restaient servies NUES, indéfiniment, pour une agence qui exige le filigrane. Il met désormais en
 * file un `RegeneratePhotoConversionsJob` par photo. Chacun est borné, a son délai et ses rejeux,
 * et fait le fail-closed de SA photo.
 */
class RegenerateAgencyWatermarksJob implements ShouldQueue
{
    use Queueable;

    /** Un rejeu remet toutes les photos en file ; une photo régénérée deux fois ne duplique rien. */
    public int $tries = 3;

    public array $backoff = [30, 120];

    /**
     * ⚠ **Strictement inférieur au `retry_after` de la connexion** (90 s, `config/queue.php`) :
     * au-delà, la file redonne le job à un autre worker pendant qu'il tourne encore. Ici, il ne
     * fait que lire des identifiants et insérer des jobs. `RegenerationTimeoutTest` compare les
     * deux valeurs.
     */
    public int $timeout = 75;

    public function __construct(
        public readonly int $agencyId,
    ) {
        $this->onQueue('media');
    }

    public function handle(): void
    {
        if (Agency::query()->whereKey($this->agencyId)->doesntExist()) {
            return;
        }

        $this->photos()->each(fn (Media $media) => RegeneratePhotoConversionsJob::dispatch((int) $media->getKey()));
    }

    /**
     * Échec DÉFINITIF de la répartition : rejeux épuisés, OU délai dépassé à la dernière
     * tentative. Dans ce second cas, le worker appelle cette méthode sans que `handle()` ait
     * fini : rien n'est supposé mis en file. Si l'agence exige le filigrane, les exemptions de
     * TOUTES ses photos sont retirées ici. Celles dont le job est déjà passé n'en ont plus, et
     * leurs conversions filigranées ne sont pas touchées. Les autres cessent d'être servies nues.
     * `media:regenerate-property-conversions --agency=… --untraced` les rattrape une fois la
     * cause levée.
     */
    public function failed(?Throwable $exception): void
    {
        $agency = Agency::query()->find($this->agencyId);
        $required = AgencyWatermarkContext::isEnabledFor($agency);
        $retirees = 0;
        $impossibles = 0;

        if ($required) {
            $this->photos()->each(function (Media $media) use (&$retirees, &$impossibles) {
                try {
                    $retirees += WatermarkTrace::withdrawExemptions((int) $media->getKey(), Property::watermarkedConversions()) ? 1 : 0;
                } catch (Throwable $retrait) {
                    $impossibles++;
                    Log::error('[RegenerateAgencyWatermarksJob] Retrait des exemptions impossible : la photo reste servie sans filigrane.', [
                        'media_id' => (int) $media->getKey(),
                        'agency_id' => $this->agencyId,
                        'exception' => $retrait->getMessage(),
                    ]);
                }
            });
        }

        Log::error('[RegenerateAgencyWatermarksJob] Régénération abandonnée : les photos de l\'agence ne sont pas toutes remises en file.'
            .($required ? ' Exemptions retirées : ces photos ne sont plus servies sans filigrane.' : ' Filigrane non exigé : rien à retirer.')
            .' Relancer media:regenerate-property-conversions --agency='.$this->agencyId.' --untraced une fois la cause levée.', [
                'agency_id' => $this->agencyId,
                'watermark_required' => $required,
                'exemptions_withdrawn' => $retirees,
                'withdrawal_failures' => $impossibles,
                'exception' => $exception?->getMessage(),
            ]);
    }

    /** @return LazyCollection<int, Media> les photos des biens de l'agence, par id croissant */
    private function photos(): LazyCollection
    {
        return Media::query()
            ->select(['id'])
            ->where('model_type', Property::class)
            ->where('collection_name', 'photos')
            ->whereIn('model_id', Property::query()->where('agency_id', $this->agencyId)->select('id'))
            ->lazyById(500);
    }
}
