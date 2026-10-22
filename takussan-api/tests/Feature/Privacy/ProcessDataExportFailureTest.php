<?php

namespace Tests\Feature\Privacy;

use App\Jobs\Privacy\ProcessDataExport;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

/**
 * Le job d'export RGPD face à ses échecs.
 *
 * TCK-1265 (P111.01) — un job tué pendant la construction (mémoire, délai du worker) ne passe pas
 * par le `catch` de `DataExportBuilder::build()` : seul `failed()` est appelé par le worker. Sans
 * lui, l'export restait `processing` pour toujours, et l'écran relançait la liste toutes les 10 s.
 */
class ProcessDataExportFailureTest extends TestCase
{
    use RefreshDatabase;

    private function export(DataExportStatus $status): DataExport
    {
        $user = User::factory()->create();

        return DataExport::query()->create([
            'user_id' => $user->id,
            'requested_by' => $user->id,
            'status' => $status,
            'requested_at' => now(),
        ]);
    }

    public function test_un_job_en_echec_passe_l_export_en_preparation_a_failed(): void
    {
        foreach ([DataExportStatus::Queued, DataExportStatus::Processing] as $status) {
            $export = $this->export($status);

            (new ProcessDataExport($export->id))->failed(new RuntimeException('worker tué'));

            $this->assertSame(DataExportStatus::Failed, $export->fresh()->status, $status->value);
        }
    }

    public function test_un_job_en_echec_ne_touche_pas_un_export_deja_pret(): void
    {
        $export = $this->export(DataExportStatus::Ready);

        (new ProcessDataExport($export->id))->failed(new RuntimeException('courriel en panne'));

        $this->assertSame(DataExportStatus::Ready, $export->fresh()->status);
    }
}
