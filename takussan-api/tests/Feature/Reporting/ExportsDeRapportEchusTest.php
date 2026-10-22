<?php

namespace Tests\Feature\Reporting;

use App\Jobs\Reporting\PurgeExpiredReportExports;
use App\Models\ReportExport;
use App\Models\User;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * TCK-1213 (P77.02) — les exports de rapport de la console (`reports/{report}-{id}.csv` sur le
 * disque `local`) ne survivent pas à leur échéance : la purge planifiée retire le fichier,
 * remet `archive_path` à `null` et passe la ligne à `expired`, la ligne gardée (le journal
 * `super_admin_report_exported` la désigne). Sur le modèle de `PurgeExpiredDataExports`.
 */
class ExportsDeRapportEchusTest extends TestCase
{
    use RefreshDatabase;

    private User $demandeur;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->demandeur = User::factory()->create();
    }

    private function export(string $status, ?string $chemin, mixed $expiresAt): ReportExport
    {
        if ($chemin !== null) {
            Storage::disk('local')->put($chemin, "a,b\n1,2\n");
        }

        return ReportExport::query()->create([
            'requested_by' => $this->demandeur->id,
            'report' => 'growth',
            'format' => 'csv',
            'status' => $status,
            'archive_path' => $chemin,
            'row_count' => 1,
            'ready_at' => now()->subDays(8),
            'expires_at' => $expiresAt,
        ]);
    }

    public function test_un_export_echu_perd_son_fichier_et_passe_expired(): void
    {
        $echu = $this->export('ready', 'reports/growth-1.csv', now()->subMinute());

        (new PurgeExpiredReportExports)->handle();

        Storage::disk('local')->assertMissing('reports/growth-1.csv');
        $echu->refresh();
        $this->assertSame('expired', $echu->status);
        $this->assertNull($echu->archive_path);
    }

    public function test_un_export_synchrone_echu_sans_fichier_passe_expired(): void
    {
        $echu = $this->export('ready', null, now()->subMinute());

        (new PurgeExpiredReportExports)->handle();

        $this->assertSame('expired', $echu->refresh()->status);
    }

    public function test_un_export_non_echu_ou_non_pret_reste_tel_quel(): void
    {
        $recent = $this->export('ready', 'reports/growth-2.csv', now()->addDay());
        $enCours = $this->export('processing', null, null);
        $echoue = $this->export('failed', null, now()->subDay());

        (new PurgeExpiredReportExports)->handle();

        Storage::disk('local')->assertExists('reports/growth-2.csv');
        $this->assertSame('ready', $recent->refresh()->status);
        $this->assertSame('reports/growth-2.csv', $recent->archive_path);
        $this->assertSame('processing', $enCours->refresh()->status);
        $this->assertSame('failed', $echoue->refresh()->status);
    }

    public function test_la_purge_est_planifiee(): void
    {
        $planifiee = collect(app(Schedule::class)->events())
            ->contains(fn ($event) => str_contains((string) $event->description, PurgeExpiredReportExports::class));

        $this->assertTrue($planifiee, 'PurgeExpiredReportExports doit être planifiée dans routes/console.php.');
    }
}
