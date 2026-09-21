<?php

namespace App\Console\Commands;

use App\Models\Property;
use App\Services\Media\WatermarkTrace;
use Illuminate\Console\Command;
use Spatie\MediaLibrary\Conversions\FileManipulator;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

/**
 * TCK-356 — régénère les conversions de la collection `photos` des biens.
 *
 * Nécessaire parce que `full` (1600 px) n'existe pas sur le média produit avant
 * TCK-356 : `PropertyResource` et `PropertyMediaController` replient sur `preview`
 * tant que la conversion manque, et ce repli n'a pas vocation à durer.
 *
 Ce qui n'est pas évident ici :
 *
 * 1. La trace `watermarked_conversions` n'est PAS purgée en bloc (TCK-539, mission 5).
 *    `ApplyWatermarkOnConversionListener` retire chaque conversion de la trace au moment
 *    où SON fichier va être réécrit (`ConversionWillStartEvent`) — sans quoi
 *    `ApplyWatermarkJob` la croirait déjà filigranée et la laisserait nue. Une purge en
 *    bloc, avant, cachait TOUTES les photos du site public pendant toute la commande.
 * 2. `FileManipulator::createDerivedFiles()` réécrit les trois conversions : `thumbnail` en
 *    ligne, `preview` et `full` en file `media`. Un média en échec est journalisé, perd ses
 *    exemptions (`WatermarkTrace::failClosed()`), et la commande sort en erreur.
 * 3. Le filigrane n'est PAS redéposé ici (TCK-539). Il suit
 *    `ConversionHasBeenCompletedEvent`, émis après l'écriture de chaque conversion :
 *    `ApplyWatermarkOnConversionListener` vérifie l'activation et envoie le job.
 *    Le déposer ici ne tenait que tant que toutes les conversions étaient synchrones.
 *    `preview` et `full` sont en file : un job déposé ici pouvait tourner AVANT leur
 *    `PerformConversionsJob`, filigraner l'ANCIEN fichier (deux fois, donc) et le
 *    marquer — puis la conversion réécrivait un fichier nu que plus rien ne filigranait.
 *
 * L'URL change à chaque passage : `media-library.version_urls` suffixe `?v=<updated_at>`,
 * et la réécriture (`markAsConversionGenerated`) comme le filigrane touchent `updated_at`
 * (ADR-0029 §6). Un
 * navigateur ou un CDN qui a gardé l'ancienne image ne la ressert donc pas.
 *
 * `--untraced` (TCK-539, R1 de la seconde passe adverse) : ne traite que les photos dont une
 * conversion PRODUITE n'est ni filigranée ni exemptée (`WatermarkTrace::hasUncovered()`) —
 * celles qu'un bien sous filigrane cache au public. Ce sont les photos antérieures à la trace,
 * ou dont le filigrane a échoué. Le compte se prend avec `--dry-run`, séparé entre biens qui
 * EXIGENT le filigrane (photos cachées aujourd'hui) et les autres (servies, mais qui le seraient
 * cachées le jour où l'agence l'active). Étape de TCK-541, avant la bascule.
 *
 * Opération manuelle : rien ne la planifie (cf. « Hors périmètre » de TCK-356).
 */
class MediaRegeneratePropertyConversions extends Command
{
    protected $signature = 'media:regenerate-property-conversions
        {--property= : Ne traiter qu\'un bien (id)}
        {--agency= : Ne traiter que les biens d\'une agence (id)}
        {--missing-only : Ne traiter que le média dépourvu de la conversion `full`}
        {--untraced : Ne traiter que le média dont une conversion produite n\'est ni filigranée ni exemptée}
        {--dry-run : Compter sans rien réécrire}';

    protected $description = 'Régénère les conversions `photos` des biens (TCK-356) et réapplique les filigranes.';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $missingOnly = (bool) $this->option('missing-only');
        $untraced = (bool) $this->option('untraced');

        if ($missingOnly && $untraced) {
            $this->error('--missing-only et --untraced ne se combinent pas.');

            return self::INVALID;
        }

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
        $caches = 0;
        $echecs = 0;
        $fileManipulator = app(FileManipulator::class);

        $query->cursor()->each(function (Property $property) use ($dryRun, $missingOnly, $untraced, $fileManipulator, &$traites, &$ignores, &$filigranes, &$caches, &$echecs): void {
            $watermarkEnabled = $property->requiresWatermark();

            foreach ($property->getMedia('photos') as $media) {
                /** @var Media $media */
                if ($missingOnly && $media->hasGeneratedConversion('full')) {
                    $ignores++;

                    continue;
                }

                if ($untraced && ! WatermarkTrace::hasUncovered($media)) {
                    $ignores++;

                    continue;
                }

                $traites++;

                if ($untraced && $watermarkEnabled) {
                    $caches++;
                }

                if ($dryRun) {
                    continue;
                }

                // Réécrire les conversions depuis la source ; la trace suit, conversion par
                // conversion (cf. docblock, point 1). PAS par `media-library:regenerate`, qui
                // avale l'exception d'une source illisible et rend 0 (quatrième passe adverse,
                // R1a) : l'échec est journalisé ici, le média perd ses exemptions, et la
                // commande sort en erreur.
                try {
                    $fileManipulator->createDerivedFiles($media);
                } catch (Throwable $exception) {
                    WatermarkTrace::failClosed($media, Property::watermarkedConversions(), $exception, 'media:regenerate-property-conversions');
                    $this->error("Media {$media->id} (bien {$property->id}) non régénéré : {$exception->getMessage()}");
                    $echecs++;

                    continue;
                }

                // Le filigrane suit l'événement de fin de conversion (cf. docblock, point 3).
                if ($watermarkEnabled) {
                    $filigranes++;
                }
            }
        });

        $verbe = $dryRun ? 'à régénérer' : 'régénérés';
        $this->info("media:regenerate-property-conversions — {$traites} média {$verbe}, {$ignores} ignorés, {$filigranes} à refiligraner à la fin de leurs conversions.");

        if ($untraced) {
            $this->info("--untraced — {$caches} photo(s) cachée(s) du public aujourd'hui (bien sous filigrane), ".($traites - $caches).' servie(s) sans trace (bien sans filigrane).');
        }

        if ($echecs > 0) {
            $this->error("{$echecs} média(s) en échec : voir le journal. Relancer avec --untraced une fois la cause levée.");

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
