<?php

namespace Tests\Feature\Notifications;

use App\Models\Agency;
use App\Models\ReportExport;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Notifications\ReportExportReadyNotification;
use App\Notifications\ThresholdAlertTriggered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Lang;
use Tests\TestCase;

/**
 * P155.04 (TCK-1439) — l'alerte de seuil et l'export de rapport nomment la métrique, la sévérité et
 * le rapport, au lieu de leurs codes (`occupancy_rate_percent`, `critical`, `revenue`). Les
 * libellés sont ceux des écrans d'origine (`dashboard.kpis.metrics`, `dashboard.alerts.severities`,
 * `reporting.tabs` du front).
 */
class AlerteEtExportLibellesTest extends TestCase
{
    use RefreshDatabase;

    private const RAPPORTS = ['growth', 'revenue', 'cohorts', 'funnel'];

    public function test_l_alerte_de_seuil_nomme_la_metrique_et_la_severite(): void
    {
        $agence = Agency::factory()->create();
        $destinataire = User::factory()->create();

        foreach (['fr', 'en', 'wo'] as $langue) {
            App::setLocale($langue);
            foreach (ThresholdAlert::allowedMetrics() as $metrique) {
                foreach (ThresholdAlert::allowedSeverities() as $severite) {
                    $alerte = new ThresholdAlert([
                        'agency_id' => $agence->id,
                        'metric' => $metrique,
                        'operator' => '<',
                        'threshold' => 70,
                        'severity' => $severite,
                        'cooldown_hours' => 24,
                    ]);
                    $courriel = (new ThresholdAlertTriggered($alerte, 62.5))->toMail($destinataire);
                    $texte = $courriel->subject.' '.(string) $courriel->render();

                    $this->assertStringNotContainsString($metrique, $texte, "métrique {$metrique} brute en {$langue}");
                    $this->assertDoesNotMatchRegularExpression('/: '.$severite.'\)/', $texte, "sévérité {$severite} brute en {$langue}");
                    // Une clé absente d'une langue retombe sur la langue de secours : le rendu seul
                    // ne le verrait pas.
                    $this->assertTrue(Lang::hasForLocale("notifications.threshold_alert_mail.metrics.{$metrique}", $langue), "métrique {$metrique} absente en {$langue}");
                    $this->assertTrue(Lang::hasForLocale("notifications.threshold_alert_mail.severities.{$severite}", $langue), "sévérité {$severite} absente en {$langue}");
                }
            }
        }
    }

    public function test_l_export_de_rapport_nomme_le_rapport(): void
    {
        $demandeur = User::factory()->create();

        foreach (['fr', 'en', 'wo'] as $langue) {
            App::setLocale($langue);
            foreach (self::RAPPORTS as $rapport) {
                $export = ReportExport::query()->create([
                    'requested_by' => $demandeur->id,
                    'report' => $rapport,
                    'format' => 'csv',
                    'status' => 'ready',
                    'row_count' => 1,
                    'ready_at' => now(),
                    'expires_at' => now()->addDays(7),
                ]);
                $texte = (string) (new ReportExportReadyNotification($export))->toMail($demandeur)->render();

                $this->assertStringNotContainsString($rapport, $texte, "rapport {$rapport} brut en {$langue}");
                $this->assertTrue(Lang::hasForLocale("notifications.report_export.reports.{$rapport}", $langue), "rapport {$rapport} absent en {$langue}");
            }
        }
    }
}
