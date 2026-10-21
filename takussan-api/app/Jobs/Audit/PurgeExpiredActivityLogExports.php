<?php

namespace App\Jobs\Audit;

use App\Http\Controllers\Api\ActivityLogExportController;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

/**
 * TCK-1143 (P63.04) — les exports du journal d'activité (`exports/audit/{user}/{uuid}.{csv|xlsx}`)
 * n'ont pas de ligne en base : seul un lien signé les sert, 24 h au plus. Passé ce délai, plus
 * rien ne peut les servir, et ils portent le journal d'une agence ou de la plateforme : ils sont
 * supprimés. Idempotent : un fichier déjà supprimé n'est plus listé.
 */
class PurgeExpiredActivityLogExports implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        $limite = now()->subHours(ActivityLogExportController::LINK_TTL_HOURS)->getTimestamp();
        $disque = Storage::disk();

        foreach ($disque->allFiles(ActivityLogExportController::STORAGE_ROOT) as $chemin) {
            if ($disque->lastModified($chemin) <= $limite) {
                $disque->delete($chemin);
            }
        }
    }
}
