<?php

namespace App\Console\Commands\Lease;

use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Services\Lease\LeaseExitScheduleService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * TCK-607 (reliquat d'E11) — reprise des baux résiliés AVANT TCK-1151 (2026-10-21), dont les
 * échéances de loyer et de charges postérieures à la sortie sont restées dues (`pending`, `late`,
 * `failed`) : elles passent `cancelled`, comme à une résiliation d'aujourd'hui
 * (`LeaseExitScheduleService::repairAfterExit`), tracées `lease_termination_schedule_cancelled`
 * avec `repair: TCK-607`.
 *
 * - **Sélection par état, pas par date** : tout bail `terminated` ; un bail sorti depuis TCK-1151 n'a
 *   plus rien d'annulable, la passe ne le touche pas. C'est ce qui la rend idempotente : rejouée,
 *   elle annule 0.
 * - **Date de sortie** : celle des voies vivantes — la date d'effet du préavis, à défaut le jour de
 *   `terminated_at`. Un bail sans l'une ni l'autre est signalé, pas deviné.
 * - **Une échéance postérieure déjà engagée** (réglée, en partie réglée, checkout ouvert) n'est pas
 *   annulée : elle est listée, pour un remboursement humain.
 * - **`--dry-run`** joue exactement la même passe dans une transaction annulée : ce qu'il affiche est
 *   ce que la passe réelle ferait.
 *
 * Une action de déploiement la fait jouer une fois par environnement :
 * `docs/deploiement/actions/2026-11-16-annuler-les-echeances-des-baux-resilies.md`.
 */
class CancelDuesAfterExitCommand extends Command
{
    protected $signature = 'lease:cancel-dues-after-exit {--dry-run : affiche ce qui serait annulé, sans rien écrire}';

    protected $description = 'Annule les échéances postérieures à la sortie des baux résiliés avant TCK-1151 (idempotent).';

    public function handle(LeaseExitScheduleService $exits): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $totals = ['leases' => 0, 'cancelled' => 0, 'cancelled_deposits' => 0, 'engaged' => 0, 'undated' => 0];

        $ids = Lease::query()->where('status', LeaseStatus::Terminated->value)->orderBy('id')->pluck('id');

        foreach ($ids as $id) {
            DB::beginTransaction();
            try {
                /** @var Lease|null $lease */
                $lease = Lease::query()->whereKey($id)->lockForUpdate()->first();
                if ($lease === null || $lease->status !== LeaseStatus::Terminated) {
                    DB::rollBack();

                    continue;
                }

                $exit = $lease->early_termination_effective_date ?? $lease->terminated_at;
                if ($exit === null) {
                    $totals['undated']++;
                    $this->warn("Bail #{$lease->id} ({$lease->reference_number}) : résilié sans date de sortie — ignoré.");
                    DB::rollBack();

                    continue;
                }

                $result = $exits->repairAfterExit($lease, Carbon::parse($exit)->startOfDay());
                $dryRun ? DB::rollBack() : DB::commit();
            } catch (\Throwable $e) {
                DB::rollBack();
                throw $e;
            }

            $touched = count($result['cancelled']) + count($result['cancelled_deposits']);
            if ($touched === 0 && $result['engaged'] === []) {
                continue;
            }

            $totals['leases']++;
            $totals['cancelled'] += count($result['cancelled']);
            $totals['cancelled_deposits'] += count($result['cancelled_deposits']);
            $totals['engaged'] += count($result['engaged']);

            $this->line(sprintf(
                'Bail #%d (%s) : %d échéance(s) annulée(s)%s%s',
                $lease->id,
                $lease->reference_number,
                count($result['cancelled']),
                $result['cancelled_deposits'] !== [] ? ', caution due annulée' : '',
                $result['engaged'] !== [] ? ' ; engagées, à rembourser à la main : '.implode(', ', $result['engaged']) : '',
            ));
        }

        $this->info(sprintf(
            '%s%d bail(s) touché(s), %d échéance(s) annulée(s), %d caution(s) due(s) annulée(s), %d échéance(s) engagée(s) laissée(s), %d bail(s) sans date de sortie.',
            $dryRun ? '[dry-run, rien n\'est écrit] ' : '',
            $totals['leases'],
            $totals['cancelled'],
            $totals['cancelled_deposits'],
            $totals['engaged'],
            $totals['undated'],
        ));

        return self::SUCCESS;
    }
}
