<?php

namespace App\Console\Commands;

use App\Jobs\Media\ApplyWatermarkJob;
use App\Models\Property;
use App\Services\Media\AgencyWatermarkContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-356 — régénère les conversions de la collection `photos` des biens.
 *
 * Nécessaire parce que `full` (1600 px) n'existe pas sur le média produit avant
 * TCK-356 : `PropertyResource` et `PropertyMediaController` replient sur `preview`
 * tant que la conversion manque, et ce repli n'a pas vocation à durer.
 *
 * L'ORDRE compte, et c'est la seule chose non évidente ici :
 *
 * 1. `watermarked_conversions` est remis à zéro AVANT la régénération. Sinon
 *    `ApplyWatermarkJob` voit la conversion comme déjà filigranée et sort sans
 *    rien faire — sur un fichier que `media-library:regenerate` vient pourtant de
 *    réécrire depuis la source, donc sans filigrane. Le média repartirait nu.
 * 2. `media-library:regenerate --force` réécrit les trois conversions.
 * 3. `ApplyWatermarkJob` est redéposé pour chaque conversion de
 *    `Property::watermarkedConversions()` — la liste unique, jamais une copie.
 *
 * ⚠ **La régénération réécrit AU MÊME CHEMIN**, et `/storage/` sert désormais
 * `Cache-Control: max-age=604800` (`scripts/server-setup.sh`, TCK-355). Un
 * navigateur qui a déjà vu l'ancienne image peut donc afficher la version d'avant
 * pendant **jusqu'à 7 jours**. C'est la même propriété qui interdit `immutable` sur
 * ce `location` : sans jeton d'URL dérivé de `media.updated_at`, une régénération
 * n'est pas immédiatement visible côté visiteur. Prévoir la fenêtre, ou purger le
 * cache du CDN pour les chemins concernés.
 *
 * Opération manuelle : rien ne la planifie (cf. « Hors périmètre » de TCK-356).
 */
class MediaRegeneratePropertyConversions extends Command
{
    protected $signature = 'media:regenerate-property-conversions
        {--property= : Ne traiter qu\'un bien (id)}
        {--agency= : Ne traiter que les biens d\'une agence (id)}
        {--missing-only : Ne traiter que le média dépourvu de la conversion `full`}
        {--dry-run : Compter sans rien réécrire}';

    protected $description = 'Régénère les conversions `photos` des biens (TCK-356) et réapplique les filigranes.';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $missingOnly = (bool) $this->option('missing-only');

        $query = Property::query()->with('agency');

        if ($id = $this->option('property')) {
            $query->whereKey((int) $id);
        }

        if ($agencyId = $this->option('agency')) {
            $query->where('agency_id', (int) $agencyId);
        }

        $traites = 0;
        $ignores = 0;
        $filigranes = 0;

        $query->cursor()->each(function (Property $property) use ($dryRun, $missingOnly, &$traites, &$ignores, &$filigranes): void {
            $agency = $property->agency;

            $watermarkEnabled = $agency !== null
                && ($agency->settings['watermark_enabled'] ?? AgencyWatermarkContext::defaults()['watermark_enabled']);

            foreach ($property->getMedia('photos') as $media) {
                /** @var Media $media */
                if ($missingOnly && $media->hasGeneratedConversion('full')) {
                    $ignores++;

                    continue;
                }

                $traites++;

                if ($dryRun) {
                    continue;
                }

                // 1. Purger la trace AVANT de réécrire les fichiers (cf. docblock).
                $media->setCustomProperty('watermarked_conversions', []);
                $media->save();

                // 2. Réécrire les conversions depuis la source.
                Artisan::call('media-library:regenerate', [
                    '--ids' => (string) $media->id,
                    '--force' => true,
                ]);

                // 3. Refiligraner ce qui doit l'être.
                if ($watermarkEnabled) {
                    foreach (Property::watermarkedConversions() as $conversion) {
                        ApplyWatermarkJob::dispatch($media->id, $conversion);
                        $filigranes++;
                    }
                }
            }
        });

        $verbe = $dryRun ? 'à régénérer' : 'régénérés';
        $this->info("media:regenerate-property-conversions — {$traites} média {$verbe}, {$ignores} ignorés, {$filigranes} filigranes redéposés.");

        if (! $dryRun) {
            $this->warn('⚠ Les fichiers sont réécrits au même chemin ; /storage/ sert max-age=604800. Compter jusqu\'à 7 jours de cache navigateur, ou purger le CDN.');
        }

        return self::SUCCESS;
    }
}
