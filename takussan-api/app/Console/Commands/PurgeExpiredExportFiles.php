<?php

namespace App\Console\Commands;

use App\Models\ExportFile;
use App\Services\Export\ExportFiles;
use Illuminate\Console\Command;

/**
 * TCK-2866 (ADR-0115 § 3) — les fichiers d'export gardés ne survivent pas à leur échéance
 * (`exports.retention_days`) : fichier effacé du disque privé, ligne supprimée. La ligne du journal
 * (`export` / `data_exported`) reste ; « Mes derniers exports » la dit alors indisponible.
 *
 * Idempotent : une ligne effacée n'est plus relue, et effacer un fichier absent ne fait rien.
 */
class PurgeExpiredExportFiles extends Command
{
    protected $signature = 'exports:purge-files';

    protected $description = 'Efface les fichiers d\'export gardés dont l\'échéance est passée (TCK-2866, ADR-0115)';

    public function handle(ExportFiles $files): int
    {
        $purged = 0;
        ExportFile::query()
            ->where('expires_at', '<=', now())
            ->orderBy('id')
            ->chunkById(200, function ($chunk) use ($files, &$purged): void {
                foreach ($chunk as $file) {
                    $files->forget($file);
                    $purged++;
                }
            });

        $this->info("{$purged} fichier(s) d'export effacé(s).");

        return self::SUCCESS;
    }
}
