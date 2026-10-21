<?php

namespace Tests\Feature\Audit;

use App\Jobs\Audit\ExportActivityLogJob;
use App\Jobs\Reporting\GenerateReportExport;
use App\Models\ReportExport;
use App\Notifications\ActivityLogExportReadyNotification;
use App\Notifications\ReportExportReadyNotification;
use App\Services\Audit\ActivityLogExporter;
use App\Services\Reporting\PlatformReportingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\ApiTestCase;

/**
 * TCK-1084 (P77.03) — une écriture refusée par le disque ne passe plus pour un succès.
 *
 * Le disque `local` est déclaré `'throw' => false` : sur un disque plein ou un droit refusé,
 * `put()` rend `false` au lieu de lever. Les trois écrivains d'export ignoraient ce retour :
 * l'export de rapport passait à `ready` et notifiait, l'export d'audit envoyait son lien, la
 * console rendait le sien — et chaque lien rendait 404. Ils lèvent désormais, comme
 * `ErasureLedger::record()`.
 *
 * Le refus se provoque par un dossier en lecture seule : l'adaptateur local lève alors
 * `UnableToWriteFile`, que `FilesystemAdapter::put()` rend en `false` sous `'throw' => false`.
 * (Un fichier posé là où un dossier est attendu ne convient pas : `UnableToCreateDirectory`
 * traverse `put()` et lève de lui-même.)
 */
class EcritureRefuseeDesExportsTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @var list<string> */
    private array $verrouilles = [];

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Notification::fake();
    }

    protected function tearDown(): void
    {
        foreach ($this->verrouilles as $dossier) {
            @chmod($dossier, 0755);
        }
        parent::tearDown();
    }

    /** Un dossier du disque où plus rien ne s'écrit ; vérifie que `put()` y rend bien `false`. */
    private function refuserLesEcrituresSous(string $dossier): void
    {
        Storage::disk('local')->makeDirectory($dossier);
        $chemin = Storage::disk('local')->path($dossier);
        chmod($chemin, 0555);
        $this->verrouilles[] = $chemin;
        $this->assertFalse(Storage::disk('local')->put("{$dossier}/sonde.txt", 'x'), 'Le dossier aurait dû refuser l\'écriture.');
    }

    public function test_l_export_de_rapport_echoue_sans_se_dire_pret_ni_notifier(): void
    {
        $demandeur = $this->actingAsRole('super_admin');
        $export = ReportExport::query()->create([
            'requested_by' => $demandeur->id,
            'report' => 'growth',
            'format' => 'csv',
            'parameters' => ['metric' => 'agencies', 'period' => '3m', 'granularity' => 'month'],
            'status' => 'queued',
            'row_count' => 0,
        ]);
        $this->refuserLesEcrituresSous('reports');

        $levee = null;
        try {
            (new GenerateReportExport($export->id))->handle(app(PlatformReportingService::class));
        } catch (RuntimeException $e) {
            $levee = $e;
        }

        $this->assertNotNull($levee, "Le job aurait dû lever sur l'écriture refusée.");
        $this->assertStringContainsString('reports/growth-', $levee->getMessage());

        $this->assertNotSame('ready', $export->fresh()->status);
        $this->assertNull($export->fresh()->ready_at);
        Notification::assertNothingSent();
        Notification::assertNotSentTo($demandeur, ReportExportReadyNotification::class);
    }

    public function test_l_export_d_audit_echoue_sans_envoyer_de_lien(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $this->refuserLesEcrituresSous("exports/audit/{$admin->id}");

        $this->expectException(RuntimeException::class);
        try {
            (new ExportActivityLogJob($admin, ['format' => 'csv']))->handle(app(ActivityLogExporter::class));
        } finally {
            Notification::assertNotSentTo($admin, ActivityLogExportReadyNotification::class);
        }
    }

    public function test_l_export_d_audit_de_la_console_ne_rend_pas_de_lien(): void
    {
        $admin = $this->apiActingAsRole('super_admin');
        $this->refuserLesEcrituresSous("exports/audit/{$admin->id}");

        $this->apiGet('/api/admin/audit/export')
            ->assertServerError()
            ->assertJsonMissingPath('data.url');
    }
}
