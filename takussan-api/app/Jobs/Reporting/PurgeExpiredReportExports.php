<?php

namespace App\Jobs\Reporting;

use App\Models\ReportExport;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

/**
 * TCK-1213 (P77.02) — les exports de rapport de la console expirent à J+7 (`expires_at`, posé par
 * `GenerateReportExport` et par le chemin synchrone de `ReportingController::export`). Passé ce
 * délai, leur lien ne sert plus rien (`ReportExportDownloadController`) : le fichier est supprimé
 * du disque `local`, `archive_path` remis à `null` et la ligne passe à `expired`. La ligne reste,
 * car le journal `super_admin_report_exported` la désigne. Sur le modèle de
 * `PurgeExpiredDataExports`. Idempotent : une ligne `expired` n'est plus relue.
 */
class PurgeExpiredReportExports implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        ReportExport::query()
            ->where('status', 'ready')
            ->where('expires_at', '<=', now())
            ->get()
            ->each(function (ReportExport $export): void {
                if ($export->archive_path) {
                    Storage::disk('local')->delete($export->archive_path);
                }
                $export->update(['status' => 'expired', 'archive_path' => null]);
            });
    }
}
