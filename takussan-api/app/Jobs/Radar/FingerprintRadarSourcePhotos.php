<?php

namespace App\Jobs\Radar;

use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * TCK-2387 (ADR-0054, ADR-0077) — le calcul de l'empreinte des photos source d'une annonce-URL, sur la file
 * `media` (celle du dHash d'ADR-0054, `worker-media`). Mis en file par `ExtractRadarListing` APRÈS une
 * extraction réussie : une annonce STOP ou en échec ne fait télécharger aucune photo.
 *
 * Squelette : le calcul s'écrit avec la tâche 3 (`SourcePhotoFingerprinter`, `UrlFetcher::fetchImage()`).
 */
final class FingerprintRadarSourcePhotos implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public function __construct(public readonly int $listingId)
    {
        $this->onQueue('media');
    }

    /** Un seul exemplaire à la fois par annonce. */
    public function uniqueId(): string
    {
        return (string) $this->listingId;
    }

    public function handle(): void
    {
        // Écrit par la tâche 3.
    }
}
