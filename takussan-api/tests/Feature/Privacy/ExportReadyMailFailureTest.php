<?php

namespace Tests\Feature\Privacy;

use App\Jobs\Privacy\ProcessDataExport;
use App\Jobs\Reporting\GenerateReportExport;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Models\ReportExport;
use App\Models\User;
use App\Services\Privacy\DataExportBuilder;
use App\Services\Reporting\PlatformReportingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Channels\MailChannel;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

/**
 * TCK-1267 (P111.03) — le courriel « prête » part dans le job, après l'écriture de `ready`. Quand
 * le transport lève, le job levait aussi : le worker le rejouait jusqu'à trois fois, l'export RGPD
 * reconstruisait son archive à chaque essai, et `GenerateReportExport::failed()` repassait un
 * rapport `ready` à `failed`, son fichier resté sur le disque et devenu inaccessible.
 */
class ExportReadyMailFailureTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->mock(MailChannel::class, fn ($mock) => $mock->shouldReceive('send')->andThrow(new RuntimeException('smtp down')));
    }

    public function test_un_courriel_en_echec_laisse_l_export_rgpd_pret_sans_faire_lever_le_job(): void
    {
        $user = User::factory()->create();
        $export = DataExport::query()->create([
            'user_id' => $user->id, 'requested_by' => $user->id, 'status' => DataExportStatus::Queued, 'requested_at' => now(),
        ]);

        (new ProcessDataExport($export->id))->handle(app(DataExportBuilder::class));

        $this->assertSame(DataExportStatus::Ready, $export->fresh()->status);
    }

    public function test_un_courriel_en_echec_laisse_le_rapport_pret_sans_faire_lever_le_job(): void
    {
        $export = $this->rapport('queued');

        (new GenerateReportExport($export->id))->handle(app(PlatformReportingService::class));

        $export->refresh();
        $this->assertSame('ready', $export->status);
        Storage::disk('local')->assertExists($export->archive_path);
    }

    public function test_un_job_de_rapport_en_echec_ne_touche_pas_un_rapport_deja_pret(): void
    {
        $export = $this->rapport('ready');

        (new GenerateReportExport($export->id))->failed(new RuntimeException('smtp down'));

        $export->refresh();
        $this->assertSame('ready', $export->status);
        $this->assertNull($export->failure_reason);
    }

    private function rapport(string $status): ReportExport
    {
        return ReportExport::query()->create([
            'requested_by' => User::factory()->create()->id,
            'report' => 'growth',
            'format' => 'csv',
            'status' => $status,
            'row_count' => 0,
        ]);
    }
}
