<?php

namespace App\Console\Commands;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Exceptions\ApiError;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * TCK-592 (P10) — clôture contradictoire : une intervention `completed` que le demandeur n'a ni
 * confirmée ni contestée sous `--days` jours (7 par défaut) est close, avec un acteur NUL et la cause
 * `auto_closed` — prestataire, donneurs d'ordre et demandeur en sont prévenus.
 *
 * Idempotente : une demande déjà close n'est plus `completed`. Une contestation remet `completed_at`
 * à nul : le délai repart de la fin de travaux suivante.
 */
class AutoCloseMaintenanceRequests extends Command
{
    protected $signature = 'maintenance:auto-close {--days=7}';

    protected $description = 'Close completed maintenance requests the requester neither confirmed nor contested.';

    public function __construct(private readonly MaintenanceRequestService $service)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $days = max(1, (int) $this->option('days'));
        $closed = 0;
        $skipped = 0;

        MaintenanceRequest::query()
            ->where('status', MaintenanceStatus::Completed->value)
            ->whereNotNull('completed_at')
            ->where('completed_at', '<=', now()->subDays($days))
            ->orderBy('id')
            ->each(function (MaintenanceRequest $mr) use ($days, &$closed, &$skipped): void {
                // P211.03 (TCK-2193) — la clôture se juge sur la ligne relue sous verrou : une
                // demande contestée (ou close) pendant le passage est refusée. Elle se saute, se
                // compte et se journalise ; le refus ne coupe plus le passage pour les suivantes.
                try {
                    $this->service->confirmResolution($mr, null, MaintenanceStatusChanged::CAUSE_AUTO_CLOSED, ['days' => $days]);
                    $closed++;
                } catch (ApiError $e) {
                    $skipped++;
                    Log::warning('maintenance:auto-close a sauté une demande refusée', [
                        'maintenance_request_id' => $mr->id,
                        'code' => $e->errorCode,
                    ]);
                }
            });

        $this->info("Closed {$closed} maintenance request(s).");
        if ($skipped > 0) {
            $this->warn("Skipped {$skipped} maintenance request(s) whose status changed during the run.");
        }

        return self::SUCCESS;
    }
}
