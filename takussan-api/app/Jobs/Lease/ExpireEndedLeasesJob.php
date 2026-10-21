<?php

namespace App\Jobs\Lease;

use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

/**
 * TCK-1153 (P81.02) — tâche quotidienne : un bail `active` dont la date de fin est passée (la
 * veille au plus tard) et qu'aucun renouvellement en vigueur ne relève passe `expired`, tracé dans
 * `activity_log` (`lease_expired`, acteur nul). Avant, rien n'écrivait `expired` : le bail allé à
 * son terme restait `active`, et la restitution de sa caution (`DepositRefundService`, qui exige
 * `terminated` ou `expired`) était impossible depuis l'écran.
 *
 * Tous les lecteurs d'`expired` l'acceptent déjà : restitution, renouvellement (un enfant signé
 * plus tard relève encore un parent `expired`), résiliation anticipée, avis.
 *
 * Idempotente : la sélection ne lit que des baux `active`, et chaque bail est rejugé sous son
 * verrou avant d'être écrit.
 */
class ExpireEndedLeasesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): int
    {
        $today = now()->toDateString();
        $expired = 0;

        $this->candidates($today)
            ->orderBy('id')
            ->chunkById(100, function ($chunk) use ($today, &$expired) {
                foreach ($chunk as $lease) {
                    if ($this->expire($lease->id, $today)) {
                        $expired++;
                    }
                }
            });

        return $expired;
    }

    private function candidates(string $today)
    {
        return Lease::query()
            ->where('status', LeaseStatus::Active->value)
            ->whereNotNull('end_date')
            ->where('end_date', '<', $today)
            ->whereDoesntHave('renewals', fn ($q) => $q->where('status', LeaseStatus::Active->value));
    }

    private function expire(int $leaseId, string $today): bool
    {
        return DB::transaction(function () use ($leaseId, $today): bool {
            $lease = $this->candidates($today)->whereKey($leaseId)->lockForUpdate()->first();
            if ($lease === null) {
                return false;
            }

            $lease->forceFill(['status' => LeaseStatus::Expired])->save();

            activity('Lease')
                ->performedOn($lease)
                ->withProperties(['end_date' => $lease->end_date?->toDateString()])
                ->event('lease_expired')
                ->log('lease_expired');

            return true;
        });
    }
}
