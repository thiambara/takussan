<?php

namespace App\Listeners\Media;

use App\Jobs\Media\ApplyWatermarkJob;
use App\Models\Property;
use App\Services\Media\WatermarkTrace;
use Spatie\MediaLibrary\Conversions\Events\ConversionHasBeenCompletedEvent;
use Spatie\MediaLibrary\Conversions\Events\ConversionWillStartEvent;

/**
 * Tient la trace `watermarked_conversions` au rythme des écritures de Spatie, conversion par
 * conversion, et envoie le filigrane (TCK-539).
 *
 * `PerformConversionAction::execute()` fait, dans cet ordre :
 *
 *   1. `ConversionWillStartEvent`             ← retrait de la trace (`handleConversionWillStart`)
 *   2. manipulations dans un fichier temporaire
 *   3. `copyToMediaLibrary()`                  ← le fichier PUBLIC devient NU ici
 *   4. `markAsConversionGenerated()` (save)
 *   5. `ConversionHasBeenCompletedEvent`       ← second retrait, puis `ApplyWatermarkJob`
 *
 * **Le retrait se fait à l'étape 1, pas à la 5** : à la 5, le fichier nu est déjà à sa clé
 * publique depuis l'étape 3 alors que la trace le dit encore filigrané, et l'API en émettrait
 * l'URL. Retirer AVANT l'écriture cache la conversion avant qu'elle ne devienne nue.
 *
 * **Le second retrait, à l'étape 5, rattrape un filigrane périmé** : un `ApplyWatermarkJob`
 * d'une génération précédente peut passer entre 1 et 3 (autre processus), filigraner l'ancien
 * fichier et le remettre dans la trace — que l'étape 3 rend fausse aussitôt. Sans ce second
 * retrait, le job de CETTE génération trouverait la conversion « déjà faite » et la laisserait
 * nue pour de bon. Reste ouvert l'intervalle 3 → 5 dans ce cas précis (quelques ms) : voir
 * TCK-547, qui supprime la condition elle-même.
 *
 * **SYNCHRONE, délibérément** (plus `ShouldQueue`) : un retrait différé par la file laisserait
 * la trace fausse pendant toute l'attente. Ce qui est lent — le filigrane — reste en file.
 *
 * Une régénération n'a donc plus à purger la trace en bloc : chaque conversion n'est cachée
 * que pendant sa propre fenêtre, et les autres restent servies, filigranées.
 */
class ApplyWatermarkOnConversionListener
{
    public function handleConversionWillStart(ConversionWillStartEvent $event): void
    {
        if (WatermarkTrace::applies($event->media, $event->conversion->getName())) {
            WatermarkTrace::retract($event->media->id, $event->conversion->getName());
        }
    }

    public function handle(ConversionHasBeenCompletedEvent $event): void
    {
        $media = $event->media;
        $conversion = $event->conversion->getName();

        if (! WatermarkTrace::applies($media, $conversion)) {
            return;
        }

        WatermarkTrace::retract($media->id, $conversion);

        $property = $media->model;

        if (! $property instanceof Property) {
            return;
        }

        // R1 — produite sans filigrane parce que l'agence n'en exige pas : on le NOTE. Sans
        // cette exemption, activer le filigrane plus tard cacherait la photo jusqu'à une
        // régénération ; avec elle, la photo reste servie jusqu'à ce que sa version filigranée
        // la remplace (`AgencyObserver` met cette régénération en file).
        if (! $property->requiresWatermark()) {
            WatermarkTrace::exempt($media->id, $conversion);

            return;
        }

        ApplyWatermarkJob::dispatch($media->id, $conversion);
    }
}
