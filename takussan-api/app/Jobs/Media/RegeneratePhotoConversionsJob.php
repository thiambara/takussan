<?php

namespace App\Jobs\Media;

use App\Models\Property;
use App\Services\Media\WatermarkTrace;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Spatie\MediaLibrary\Conversions\FileManipulator;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

/**
 * Réécrit les conversions d'UNE photo de bien depuis sa source (TCK-539, cinquième passe
 * adverse, V5-1). Mis en file par `RegenerateAgencyWatermarksJob`, un job par photo.
 *
 * **Pourquoi une photo et pas un bien, ni une agence.** Le travail tenait dans un seul job par
 * agence, sans délai propre : au délai du worker (60 s par défaut), le processus est tué, et
 * chaque rejeu repartait du premier bien. Une agence trop longue à régénérer ne finissait
 * jamais, et le dernier rejeu appelait `failed()` sans que `handle()` ait retiré quoi que ce
 * soit. Un bien n'est pas une unité bornée non plus : rien ne limite le nombre de photos d'un
 * bien (relevé : aucune règle `max` sur la collection `photos`). Une photo l'est : une lecture
 * de la source, `thumbnail` en ligne, `preview` et `full` renvoyées en file.
 *
 * Le filigrane n'est PAS déposé ici : il suit `ConversionHasBeenCompletedEvent` (cf.
 * `RegenerateAgencyWatermarksJob`).
 */
class RegeneratePhotoConversionsJob implements ShouldQueue
{
    use Queueable;

    /** Un rejeu réécrit la photo depuis la source : il ne duplique rien. */
    public int $tries = 3;

    public array $backoff = [30, 120];

    /**
     * ⚠ **Strictement inférieur au `retry_after` de la connexion** (90 s pour `database`, `redis`
     * et `beanstalkd`, `config/queue.php`). Au-delà, la file croit le job perdu et le redonne à un
     * autre worker PENDANT qu'il tourne encore : deux copies réécrivent la même photo. Un test
     * compare les deux valeurs (`RegenerationTimeoutTest`) ; qui change l'une relit l'autre.
     */
    public int $timeout = 75;

    public function __construct(
        public readonly int $mediaId,
    ) {
        $this->onQueue('media');
    }

    /**
     * Un échec à CETTE tentative retire tout de suite les exemptions de la photo, avant les
     * rejeux, puis relance l'exception pour que la file rejoue. Le rejeu qui réussit remet la
     * photo en service, filigranée. Un délai dépassé ne passe pas par ici : c'est `failed()`
     * qui retire alors les exemptions, au dernier essai.
     */
    public function handle(): void
    {
        $media = Media::query()->find($this->mediaId);

        if ($media === null) {
            return;
        }

        try {
            app(FileManipulator::class)->createDerivedFiles($media);
        } catch (Throwable $exception) {
            WatermarkTrace::failClosed($media, Property::watermarkedConversions(), $exception, 'RegeneratePhotoConversionsJob');

            throw $exception;
        }
    }

    /**
     * Échec DÉFINITIF : rejeux épuisés, OU délai dépassé à la dernière tentative. Dans ce second
     * cas, le worker appelle cette méthode sans que `handle()` ait atteint son `catch` : rien
     * n'est supposé fait. Les exemptions de la photo sont retirées ici si le bien exige le
     * filigrane (`WatermarkTrace::failClosed()`, qui journalise), pour qu'elle ne reste pas
     * servie nue. `media:regenerate-property-conversions --untraced` la rattrape une fois la
     * cause levée.
     */
    public function failed(?Throwable $exception): void
    {
        $media = Media::query()->find($this->mediaId);

        if ($media === null) {
            Log::warning('[RegeneratePhotoConversionsJob] Régénération abandonnée pour un média supprimé depuis : rien à retirer.', [
                'media_id' => $this->mediaId,
                'exception' => $exception?->getMessage(),
            ]);

            return;
        }

        WatermarkTrace::failClosed(
            $media,
            Property::watermarkedConversions(),
            $exception ?? new RuntimeException('Échec définitif sans exception.'),
            'RegeneratePhotoConversionsJob',
        );
    }
}
