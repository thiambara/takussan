<?php

namespace App\Jobs\Documents;

use App\Models\DocumentVaultArchive;
use App\Models\Enums\DocumentVaultArchiveStatus;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Queue\Queueable;

/**
 * TCK-2812 (ADR-0099, amendement du 2026-11-14, § 8) — une archive prête ne survit pas à son lien : passé
 * `expires_at`, plus rien ne peut la servir, et elle porte les documents d'un compte. Son fichier et sa
 * ligne sont effacés. Une préparation échouée, ou restée en cours (travail perdu), s'efface après
 * {@see DocumentVaultArchive::DUREE_EN_HEURES} heures.
 *
 * Idempotent : une ligne effacée n'est plus relue, et effacer un fichier absent ne fait rien.
 */
final class PurgerLesArchivesDuCoffre implements ShouldQueue
{
    use Queueable;

    public function handle(): void
    {
        $limite = now()->subHours(DocumentVaultArchive::DUREE_EN_HEURES);

        DocumentVaultArchive::query()
            ->where(fn (Builder $q) => $q
                ->where(fn (Builder $q) => $q->where('status', DocumentVaultArchiveStatus::Ready->value)->where('expires_at', '<=', now()))
                ->orWhere(fn (Builder $q) => $q->where('status', '!=', DocumentVaultArchiveStatus::Ready->value)->where('updated_at', '<=', $limite)))
            ->orderBy('id')
            ->each(function (DocumentVaultArchive $archive): void {
                $archive->effacerLeFichier();
                $archive->delete();
            });
    }
}
