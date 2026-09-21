<?php

namespace App\Listeners\Media;

use App\Services\Media\WatermarkTrace;
use Illuminate\Queue\Events\JobFailed;
use Spatie\MediaLibrary\Conversions\Conversion;
use Spatie\MediaLibrary\Conversions\Jobs\PerformConversionsJob;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

/**
 * Un `PerformConversionsJob` (conversions en file : `preview`, `full`) qui échoue pour de bon
 * n'atteint jamais `ConversionWillStartEvent` — la source se lit AVANT —, donc ne retire pas les
 * exemptions de ses conversions : une photo exemptée resterait servie NUE pour une agence qui
 * exige désormais le filigrane (quatrième passe adverse, R1a, versant asynchrone).
 *
 * Même réponse que la régénération synchrone : `WatermarkTrace::failClosed()` — journal, et
 * retrait des exemptions si le bien exige le filigrane. `thumbnail`, en ligne, a pu réussir :
 * le repli garde alors la photo à l'écran, filigranée.
 *
 * Le job est de Spatie (`media-library.jobs.perform_conversions`) et n'a pas de `failed()` ; ses
 * propriétés sont protégées, d'où la lecture par `Closure::call()`.
 */
class FailClosedWhenConversionsJobFails
{
    public function handle(JobFailed $event): void
    {
        try {
            $payload = $event->job->payload();

            if (! is_a($payload['data']['commandName'] ?? '', PerformConversionsJob::class, true)) {
                return;
            }

            $command = unserialize($payload['data']['command']);
            $media = (fn () => $this->media)->call($command);
            $conversions = (fn () => $this->conversions)->call($command);
        } catch (Throwable) {
            // Média supprimé entre-temps, charge utile illisible : rien à retirer.
            return;
        }

        if (! $media instanceof Media) {
            return;
        }

        $names = collect($conversions)
            ->map(fn (Conversion $conversion) => $conversion->getName())
            ->filter(fn (string $name) => WatermarkTrace::applies($media, $name))
            ->values()
            ->all();

        if ($names !== []) {
            WatermarkTrace::failClosed($media, $names, $event->exception, 'PerformConversionsJob');
        }
    }
}
