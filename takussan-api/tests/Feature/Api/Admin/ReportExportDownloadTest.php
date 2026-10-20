<?php

namespace Tests\Feature\Api\Admin;

use App\Jobs\Reporting\GenerateReportExport;
use App\Models\ReportExport;
use App\Models\User;
use App\Notifications\ReportExportReadyNotification;
use App\Services\Reporting\PlatformReportingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-1051 (P63.02) — le courriel « export de rapport prêt » mène à une route qui sert le fichier.
 *
 * Avant ce ticket, le lien visait `/api/admin/reports/{report}/exports/{id}/download`, qu'aucune
 * route ne déclarait : le clic rendait 404, et le fichier écrit par le job n'était lu par rien.
 * La route est signée jusqu'à `expires_at`, hors `auth:sanctum` (un client de courriel n'envoie pas
 * le jeton `Bearer`), liée au demandeur et ne sert que l'export `ready` qu'elle désigne.
 */
class ReportExportDownloadTest extends TestCase
{
    use RefreshDatabase;

    private User $demandeur;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Notification::fake();
        $this->demandeur = $this->actingAsRole('super_admin');
    }

    /** Un export passé par le job, et l'URL que porte son courriel. */
    private function exportPret(?User $demandeur = null): array
    {
        $export = ReportExport::query()->create([
            'requested_by' => ($demandeur ?? $this->demandeur)->id,
            'report' => 'growth',
            'format' => 'csv',
            'parameters' => ['metric' => 'agencies', 'period' => '3m', 'granularity' => 'month'],
            'status' => 'queued',
            'row_count' => 0,
        ]);

        (new GenerateReportExport($export->id))->handle(app(PlatformReportingService::class));

        $url = null;
        Notification::assertSentTo(
            $demandeur ?? $this->demandeur,
            ReportExportReadyNotification::class,
            function (ReportExportReadyNotification $n, array $channels, object $notifiable) use (&$url, $export) {
                $candidate = $n->toMail($notifiable)->actionUrl;
                if (str_contains($candidate, "/{$export->id}/")) {
                    $url = $candidate;
                }

                return $url !== null;
            },
        );

        return [$export->fresh(), $url];
    }

    /** Le lien s'ouvre depuis une messagerie : aucune session, aucun jeton. */
    private function ouvrir(string $url): TestResponse
    {
        Auth::forgetGuards();

        return $this->get($url);
    }

    public function test_le_lien_du_courriel_vise_une_route_declaree_et_sert_le_fichier_sans_session(): void
    {
        [$export, $url] = $this->exportPret();

        $chemin = ltrim((string) parse_url($url, PHP_URL_PATH), '/');
        $route = collect(Route::getRoutes()->getRoutes())
            ->first(fn ($r) => in_array('GET', $r->methods(), true)
                && preg_match('#^'.preg_replace('#\{[^}]+\}#', '[^/]+', $r->uri()).'$#', $chemin) === 1);
        $this->assertNotNull($route, "Aucune route ne répond à {$chemin}");
        $this->assertNotContains('auth:sanctum', $route->gatherMiddleware());

        $response = $this->ouvrir($url);

        $response->assertOk();
        $this->assertSame(
            Storage::disk('local')->get($export->archive_path),
            $response->streamedContent(),
        );
        $this->assertStringContainsString('growth', (string) $response->headers->get('Content-Disposition'));
    }

    public function test_le_lien_expire_avec_l_export(): void
    {
        [$export, $url] = $this->exportPret();

        $this->travelTo($export->expires_at->copy()->addMinute());

        $this->ouvrir($url)->assertForbidden();
    }

    public function test_un_lien_sans_signature_ou_retouche_est_refuse(): void
    {
        [, $url] = $this->exportPret();
        [$autre] = $this->exportPret();

        $this->ouvrir(strtok($url, '?'))->assertForbidden();
        $this->ouvrir(preg_replace('#/\d+/download#', "/{$autre->id}/download", $url))->assertForbidden();
    }

    public function test_un_lien_signe_pour_un_autre_que_le_demandeur_ne_sert_rien(): void
    {
        [$export] = $this->exportPret();
        $autre = User::factory()->create();

        $url = URL::temporarySignedRoute(
            'report-exports.download',
            $export->expires_at,
            ['reportExport' => $export->id, 'user' => $autre->id],
        );

        $this->ouvrir($url)->assertNotFound();
    }

    public function test_seul_un_export_pret_se_sert(): void
    {
        [$export] = $this->exportPret();
        $export->update(['status' => 'failed']);

        $url = URL::temporarySignedRoute(
            'report-exports.download',
            now()->addDay(),
            ['reportExport' => $export->id, 'user' => $this->demandeur->id],
        );

        $this->ouvrir($url)->assertNotFound();
    }
}
