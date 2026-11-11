<?php

namespace App\Services\Credits;

use App\Models\PropertyBoost;
use App\Models\PropertyBoostDailyStat;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2663 — ce qu'une mise en avant a rapporté, mesuré DANS SA FENÊTRE : de `starts_at` à
 * `ended_at`, ou à maintenant si elle court.
 *
 * - `impressions`, `clicks` : la somme de ses `property_boost_daily_stats` (comptées par boost, donc
 *   déjà bornées à sa vie) ;
 * - `contacts` : les `property_contact_leads` du bien dans la fenêtre, tous canaux (formulaire,
 *   WhatsApp, appel), de l'espace qui a payé le boost ;
 * - `visits` : les `property_visits` du bien DEMANDÉES dans la fenêtre (`created_at`), tous statuts.
 *
 * Des COMPTES seulement : aucune donnée du demandeur ne sort. Une requête agrégée par mesure, quel
 * que soit le nombre de boosts (pas de N+1). Une Remontée naît close (`starts_at = ended_at`) : sa
 * fenêtre est un instant, ses contacts et visites valent 0 — l'API n'invente pas de fenêtre.
 */
final class BoostMeasures
{
    /**
     * Pose `measures` sur chaque boost, comme un `withCount` : `CreditBoostResource` le lit.
     *
     * @param  Collection<int, PropertyBoost>  $boosts
     */
    public function attachTo(Collection $boosts): void
    {
        $measures = $this->for($boosts);
        foreach ($boosts as $boost) {
            $boost->setAttribute('measures', $measures[$boost->getKey()]);
        }
    }

    /**
     * @param  Collection<int, PropertyBoost>  $boosts
     * @return array<int, array{impressions: int, clicks: int, contacts: int, visits: int}>
     */
    public function for(Collection $boosts): array
    {
        $ids = $boosts->modelKeys();
        if ($ids === []) {
            return [];
        }

        $now = now();
        $stats = PropertyBoostDailyStat::query()->toBase()
            ->whereIn('property_boost_id', $ids)
            ->groupBy('property_boost_id')
            ->selectRaw('property_boost_id, SUM(impressions) AS impressions, SUM(clicks) AS clicks')
            ->get()
            ->keyBy('property_boost_id');
        $contacts = $this->inWindow('property_contact_leads', $ids, $now, sameAgency: true);
        $visits = $this->inWindow('property_visits', $ids, $now, sameAgency: false);

        $measures = [];
        foreach ($ids as $id) {
            $measures[$id] = [
                'impressions' => (int) ($stats[$id]->impressions ?? 0),
                'clicks' => (int) ($stats[$id]->clicks ?? 0),
                'contacts' => (int) ($contacts[$id] ?? 0),
                'visits' => (int) ($visits[$id] ?? 0),
            ];
        }

        return $measures;
    }

    /**
     * Les lignes de `$table` sur le bien de chaque boost, créées dans sa fenêtre.
     *
     * @param  list<int>  $ids
     * @return Collection<int, int>
     */
    private function inWindow(string $table, array $ids, \DateTimeInterface $now, bool $sameAgency): Collection
    {
        return DB::table('property_boosts as b')
            ->join("{$table} as m", function (JoinClause $join) use ($sameAgency): void {
                $join->on('m.property_id', '=', 'b.property_id')
                    ->on('m.created_at', '>=', 'b.starts_at');
                if ($sameAgency) {
                    $join->on('m.agency_id', '=', 'b.agency_id');
                }
            })
            ->whereIn('b.id', $ids)
            ->whereRaw('m.created_at <= COALESCE(b.ended_at, ?)', [$now])
            ->groupBy('b.id')
            ->selectRaw('b.id, COUNT(*) AS n')
            ->pluck('n', 'id');
    }
}
