<?php

namespace Tests\Feature\Audit;

use App\Http\Controllers\Api\ActivityLogExportController;
use App\Jobs\Audit\ExportActivityLogJob;
use App\Jobs\Audit\PurgeExpiredActivityLogExports;
use App\Jobs\Reporting\GenerateReportExport;
use App\Models\ReportExport;
use App\Notifications\ActivityLogExportReadyNotification;
use App\Services\Audit\ActivityLogExporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\ApiTestCase;

/**
 * TCK-1145 (P77.04) — les exports d'audit nomment le disque `local`, comme les exports RGPD et de
 * rapport : ils ne suivent plus `FILESYSTEM_DISK`. Et un export de rapport en échec le dit.
 */
class DisqueDesExportsTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Storage::fake('public');
        // Un disque par défaut autre que `local` : ce que ferait `FILESYSTEM_DISK=s3`.
        config(['filesystems.default' => 'public']);
        Notification::fake();
    }

    public function test_l_export_d_audit_asynchrone_s_ecrit_et_se_sert_sur_le_disque_local(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $this->app->instance('request', Request::create('/'));
        (new ExportActivityLogJob($admin, ['format' => 'csv']))->handle(app(ActivityLogExporter::class));

        $this->assertCount(1, Storage::disk('local')->allFiles(ActivityLogExportController::STORAGE_ROOT));
        $this->assertSame([], Storage::disk('public')->allFiles());

        $lien = null;
        Notification::assertSentTo($admin, ActivityLogExportReadyNotification::class, function ($n) use (&$lien) {
            $lien = $n->downloadUrl;

            return true;
        });
        $this->get($lien)->assertOk();
    }

    public function test_l_export_d_audit_de_la_console_s_ecrit_sur_le_disque_local(): void
    {
        $this->apiActingAsRole('super_admin');

        $url = $this->apiGet('/api/admin/audit/export')->assertOk()->json('data.url');

        $this->assertCount(1, Storage::disk('local')->allFiles(ActivityLogExportController::STORAGE_ROOT));
        $this->assertSame([], Storage::disk('public')->allFiles());
        $this->get($url)->assertOk();
    }

    public function test_la_purge_des_exports_d_audit_lit_le_disque_local(): void
    {
        $echu = ActivityLogExportController::storagePath(7, '11111111-1111-4111-8111-111111111111.csv');
        Storage::disk('local')->put($echu, 'ancien');
        touch(Storage::disk('local')->path($echu), now()->subHours(ActivityLogExportController::LINK_TTL_HOURS + 1)->getTimestamp());

        (new PurgeExpiredActivityLogExports)->handle();

        Storage::disk('local')->assertMissing($echu);
    }

    public function test_un_export_de_rapport_en_echec_passe_a_failed_avec_son_motif(): void
    {
        $demandeur = $this->actingAsRole('super_admin');
        $export = ReportExport::query()->create([
            'requested_by' => $demandeur->id,
            'report' => 'growth',
            'format' => 'csv',
            'status' => 'processing',
            'row_count' => 0,
        ]);

        (new GenerateReportExport($export->id))->failed(new RuntimeException('calcul impossible'));

        $export->refresh();
        $this->assertSame('failed', $export->status);
        $this->assertSame('calcul impossible', $export->failure_reason);
    }
}
