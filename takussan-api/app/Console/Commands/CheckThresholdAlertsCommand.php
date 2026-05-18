<?php

namespace App\Console\Commands;

use App\Models\Agency;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Notifications\ThresholdAlertTriggered;
use App\Services\Dashboard\KpiResolver;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Notification;

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
                $value = (float) ($metrics[$alert->metric] ?? 0.0);

                if (! $alert->shouldTrigger($value)) {
                    continue;
                }

                $recipients = User::query()
                    ->whereHas('agencyAdminProfiles', fn ($qq) => $qq->where('agency_id', $agency->id))
                    ->get();

                if ($recipients->isNotEmpty()) {
                    Notification::send($recipients, new ThresholdAlertTriggered($alert, $value));
                }

                $alert->forceFill([
                    'last_triggered_at' => now(),
                    'last_value' => $value,
                ])->save();

                $fired++;
            }
        }

        $this->info("Threshold check complete — {$fired} alert(s) fired.");

        return self::SUCCESS;
    }
}
