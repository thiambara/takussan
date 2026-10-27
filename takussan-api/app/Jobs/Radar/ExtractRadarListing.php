<?php

namespace App\Jobs\Radar;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * TCK-2386 (ADR-0077 §5) — l'extraction d'une annonce saisie. Mise en file par
 * `RadarListingIntake` après le commit de la saisie, jamais pour une annonce déjà connue ni pour un
 * annonceur qui a dit STOP.
 */
final class ExtractRadarListing implements ShouldQueue
{
    use Queueable;

    public function __construct(public readonly int $listingId) {}

    public function handle(): void
    {
        // Coquille posée par la tâche 5 (la saisie) : la tâche 6 (le job d'extraction) la remplit.
    }
}
