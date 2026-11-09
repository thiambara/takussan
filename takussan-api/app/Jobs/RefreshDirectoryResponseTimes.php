<?php

namespace App\Jobs;

use App\Services\Directory\ResponseTimes;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2518 — recalcule chaque nuit le délai de réponse habituel des agences et des agents
 * ({@see ResponseTimes}) et le range dans `agencies.median_response_minutes` et
 * `agent_profiles.median_response_minutes`, ses seuls écrivains.
 *
 * **Idempotent, par construction et non par verrou** : chaque passage recalcule l'état ENTIER
 * depuis les messages et le pose — la valeur calculée là où elle existe, `null` partout ailleurs
 * (une agence repassée sous le seuil perd son délai). Deux passages à la suite, ou concurrents,
 * rendent le même état. Il n'écrit qu'une ligne qui change (`IS DISTINCT FROM`), par le
 * constructeur de requêtes : ni journal d'audit ni `updated_at` touché pour une valeur dérivée.
 */
class RefreshDirectoryResponseTimes implements ShouldQueue
{
    use Queueable;

    public function handle(ResponseTimes $delais): void
    {
        $agences = $delais->parAgence();
        $agents = $delais->parAgent();

        DB::transaction(function () use ($agences, $agents): void {
            foreach ($agences as $agenceId => $minutes) {
                DB::table('agencies')->where('id', $agenceId)
                    ->whereRaw('median_response_minutes IS DISTINCT FROM ?', [$minutes])
                    ->update(['median_response_minutes' => $minutes]);
            }
            DB::table('agencies')->whereNotNull('median_response_minutes')
                ->whereNotIn('id', array_keys($agences) ?: [0])
                ->update(['median_response_minutes' => null]);

            $gardes = [];
            foreach ($agents as $cle => $minutes) {
                [$agenceId, $userId] = array_map('intval', explode(':', $cle));
                $ids = DB::table('agent_profiles')->where('agency_id', $agenceId)->where('user_id', $userId)->pluck('id')->all();
                array_push($gardes, ...$ids);
                DB::table('agent_profiles')->whereIn('id', $ids ?: [0])
                    ->whereRaw('median_response_minutes IS DISTINCT FROM ?', [$minutes])
                    ->update(['median_response_minutes' => $minutes]);
            }
            DB::table('agent_profiles')->whereNotNull('median_response_minutes')
                ->whereNotIn('id', $gardes ?: [0])
                ->update(['median_response_minutes' => null]);
        });
    }
}
