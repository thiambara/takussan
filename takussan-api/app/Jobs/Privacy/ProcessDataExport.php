<?php

namespace App\Jobs\Privacy;

use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Notifications\DataExportReadyNotification;
use App\Services\Privacy\DataExportBuilder;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class ProcessDataExport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public readonly int $dataExportId) {}

    public function handle(DataExportBuilder $builder): void
    {
        $export = $builder->build(DataExport::query()->findOrFail($this->dataExportId));
        // TCK-1267 (P111.03) — l'export est prêt, et l'écran « Mes données » le montre : un courriel
        // qui échoue se signale sans faire lever le job, que le worker rejouerait en reconstruisant
        // l'archive à chaque essai.
        try {
            $export->user?->notify(new DataExportReadyNotification($export));
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * TCK-1265 (P111.01) — un job tué pendant la construction (mémoire, délai du worker) ne passe
     * pas par le `catch` de {@see DataExportBuilder::build()} : le worker n'appelle que cette
     * méthode. Sans elle, l'export restait `processing` pour toujours. Seul un export encore en
     * préparation passe à `failed` : un export `ready` reste téléchargeable.
     */
    public function failed(Throwable $exception): void
    {
        DataExport::query()
            ->whereKey($this->dataExportId)
            ->whereIn('status', [DataExportStatus::Queued, DataExportStatus::Processing])
            ->update(['status' => DataExportStatus::Failed, 'updated_at' => now()]);
    }
}
