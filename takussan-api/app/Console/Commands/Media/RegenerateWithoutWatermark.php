<?php

namespace App\Console\Commands\Media;

use App\Jobs\Media\RegeneratePhotoConversionsJob;
use App\Models\Property;
use App\Services\Media\AgencyWatermarkContext;
use App\Services\Media\WatermarkTrace;
use Illuminate\Console\Command;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-633 (lot A) — retire le filigrane des photos de biens qui le portent déjà, une fois le
 * drapeau global `media_watermark` éteint. Éteindre le drapeau sert les photos à venir et celles
 * qui attendaient leur filigrane ; celles qui le portent déjà le garderaient sans cette commande.
 *
 * Sélectionne les photos dont la trace `watermarked_conversions` n'est pas vide, les lit PAR LOTS
 * (`--chunk`), et met en file `media` un `RegeneratePhotoConversionsJob` par photo — borné,
 * rejouable, fail-closed. Chaque conversion réécrite sort de la trace (l'écouteur, à
 * `ConversionWillStartEvent`) puis est exemptée, le filigrane n'étant plus exigé : la photo sort
 * de la sélection. **Idempotente** : relancée une fois la file vidée, elle ne trouve plus rien ;
 * relancée AVANT, elle remet en file des photos pas encore traitées, ce qui ne duplique rien.
 *
 * **Refuse quand le drapeau est allumé** : la régénération referait chaque filigrane.
 * `--dry-run` compte dans les deux cas. Opération manuelle : rien ne la planifie.
 */
class RegenerateWithoutWatermark extends Command
{
    protected $signature = 'media:regenerate-without-watermark
        {--chunk=500 : Photos lues par requête}
        {--dry-run : Compter sans rien mettre en file}';

    protected $description = 'Met en file la régénération sans filigrane des photos de biens déjà filigranées, drapeau `media_watermark` éteint (TCK-633).';

    public function handle(): int
    {
        $chunk = filter_var($this->option('chunk'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

        if ($chunk === false) {
            $this->error('--chunk attend un entier supérieur ou égal à 1.');

            return self::INVALID;
        }

        $query = Media::query()
            ->select(['id'])
            ->where('model_type', Property::class)
            ->where('collection_name', 'photos')
            ->whereJsonLength('custom_properties->'.WatermarkTrace::KEY, '>', 0);

        if ($this->option('dry-run')) {
            $this->info('media:regenerate-without-watermark — '.$query->count().' photo(s) filigranée(s) à régénérer sans filigrane.');

            return self::SUCCESS;
        }

        if (AgencyWatermarkContext::globallyEnabled()) {
            $this->error('Le drapeau `media_watermark` est allumé : la régénération referait chaque filigrane. Éteignez-le d\'abord.');

            return self::FAILURE;
        }

        $mises = 0;

        $query->lazyById($chunk)->each(function (Media $media) use (&$mises) {
            RegeneratePhotoConversionsJob::dispatch((int) $media->getKey());
            $mises++;
        });

        $this->info("media:regenerate-without-watermark — {$mises} photo(s) mises en file `media`, par lots de {$chunk}.");

        return self::SUCCESS;
    }
}
