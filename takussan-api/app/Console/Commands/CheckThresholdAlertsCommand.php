<?php

namespace App\Console\Commands;

use App\Models\Agency;
use App\Models\ThresholdAlert;
use App\Notifications\ThresholdAlertTriggered;
use App\Services\Dashboard\KpiResolver;
use App\Services\Dashboard\ThresholdAlertReading;
use App\Services\Dashboard\ThresholdAlertRecipients;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * TCK-032 P3 — evaluates all enabled threshold alerts and notifies the
 * agency's admins when a metric has crossed its threshold.
 *
 * Registered on the schedule in routes/console.php.
 */
class CheckThresholdAlertsCommand extends Command
{
    protected $signature = 'dashboard:check-alerts';

    protected $description = 'Evaluate configured threshold alerts and dispatch notifications when crossed (TCK-032 P3)';

    public function handle(KpiResolver $resolver): int
    {
        $alerts = ThresholdAlert::where('is_enabled', true)->get();

        if ($alerts->isEmpty()) {
            $this->info('No enabled alerts — nothing to check.');

            return self::SUCCESS;
        }

        // Group alerts by agency so we only compute the summary once per agency.
        $byAgency = $alerts->groupBy('agency_id');
        $fired = 0;

        foreach ($byAgency as $agencyId => $agencyAlerts) {
            $agency = Agency::find($agencyId);
            if (! $agency) {
                continue;
            }

            $metrics = $resolver->forAgency($agency);

            foreach ($agencyAlerts as $alert) {
                // Une métrique sans dénominateur rend `null` (TCK-1114) : elle n'est ni sous
                // ni au-dessus d'un seuil, l'alerte ne se juge pas.
                if (array_key_exists($alert->metric, $metrics) && $metrics[$alert->metric] === null) {
                    continue;
                }

                $value = (float) ($metrics[$alert->metric] ?? 0.0);

                if (! $alert->shouldTrigger($value)) {
                    continue;
                }

                // TCK-2627 — la requête que la lecture de l'alerte nomme aussi.
                $recipients = ThresholdAlertRecipients::query((int) $agency->id)->get();

                // P123.05 (TCK-1249) — marquée AVANT l'envoi, et l'échec rattrapé par alerte : un
                // courriel qui levait laissait la cloche écrite et `last_triggered_at` nul, arrêtait
                // la boucle sur les agences suivantes, et le passage horaire suivant récrivait la
                // cloche. `cooldown_hours` promet un déclenchement par fenêtre, envoi réussi ou non.
                // TCK-2627 — le déclenchement entre au journal dans la MÊME transaction que
                // `last_triggered_at`, avant l'envoi : l'historique ne perd pas une alerte dont le
                // courriel a levé, et ne garde pas une entrée que la marque n'a pas suivie.
                DB::transaction(function () use ($alert, $value, $recipients): void {
                    $alert->forceFill([
                        'last_triggered_at' => now(),
                        'last_value' => $value,
                    ])->save();

                    activity(ThresholdAlertReading::LOG_NAME)
                        ->performedOn($alert)
                        ->event(ThresholdAlertReading::EVENT)
                        ->withProperties([
                            'value' => $value,
                            'threshold' => (float) $alert->threshold,
                            'operator' => $alert->operator,
                            'recipients_count' => $recipients->count(),
                        ])
                        ->log(ThresholdAlertReading::EVENT);
                });

                $fired++;

                if ($recipients->isNotEmpty()) {
                    try {
                        Notification::send($recipients, new ThresholdAlertTriggered($alert, $value));
                    } catch (Throwable $e) {
                        report($e);
                    }
                }
            }
        }

        $this->info("Threshold check complete — {$fired} alert(s) fired.");

        return self::SUCCESS;
    }
}
