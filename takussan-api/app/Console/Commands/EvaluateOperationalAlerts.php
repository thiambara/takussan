<?php

namespace App\Console\Commands;

use App\Services\Admin\HealthcheckService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Les alertes d'EXPLOITATION (TCK-600, S16). Une alerte ne naissait que d'une activité métier
 * (`Activity::created` → `DispatchAlerts`) : une rafale d'échecs de jobs, une file à l'arrêt ou une
 * santé dégradée ne prévenaient personne.
 *
 * Chaque condition est écrite en activité (`ops_*`, alertable) à sa TRANSITION seulement — de
 * « non » à « oui ». Tant qu'elle dure, les passages suivants se taisent ; qu'elle cesse, et la
 * prochaine apparition alerte de nouveau. Sans cet état, une file arrêtée enverrait une alerte
 * toutes les cinq minutes jusqu'à ce qu'on coupe la règle.
 */
class EvaluateOperationalAlerts extends Command
{
    protected $signature = 'alerts:evaluate';

    protected $description = "Écrit les alertes d'exploitation (échecs de jobs, files, santé) à leur transition";

    /** Échecs de jobs sur l'heure glissante qui font une rafale. */
    public const FAILED_JOBS_SPIKE_THRESHOLD = 20;

    public function handle(HealthcheckService $health): int
    {
        $snapshot = $health->snapshot();

        $failed = DB::table('failed_jobs')->where('failed_at', '>=', now()->subHour())->count();
        $this->transition('ops_failed_jobs_spike', $failed >= self::FAILED_JOBS_SPIKE_THRESHOLD, [
            'failed_jobs_1h' => $failed,
            'threshold' => self::FAILED_JOBS_SPIKE_THRESHOLD,
        ]);

        $queue = $snapshot['queue'] ?? [];
        $workers = $snapshot['workers'] ?? [];
        $this->transition('ops_queue_stalled', ($queue['status'] ?? 'ok') !== 'ok' || ($workers['status'] ?? 'ok') === 'failed', [
            'queue_status' => $queue['status'] ?? null,
            'oldest_pending_seconds' => $queue['oldest_pending_seconds'] ?? null,
            'workers_status' => $workers['status'] ?? null,
        ]);

        $this->transition('ops_health_degraded', ($snapshot['status'] ?? 'ok') !== 'ok', [
            'status' => $snapshot['status'] ?? null,
            'failing' => collect($snapshot)
                ->filter(fn ($probe) => is_array($probe) && ($probe['status'] ?? 'ok') !== 'ok')
                ->map(fn (array $probe) => $probe['status'])
                ->all(),
        ]);

        return self::SUCCESS;
    }

    public static function stateKey(string $event): string
    {
        return "alerts:ops-state:{$event}";
    }

    /**
     * @param  array<string,mixed>  $properties
     */
    private function transition(string $event, bool $active, array $properties): void
    {
        $was = (bool) Cache::get(self::stateKey($event), false);
        Cache::forever(self::stateKey($event), $active);

        if ($active && ! $was) {
            activity('Ops')->event($event)->withProperties($properties)->log($event);
            $this->line($event);
        }
    }
}
