<?php

namespace App\Services\Radar;

use App\Models\GeoNeighborhood;
use App\Models\RadarListing;
use App\Services\Search\QuartierDuFiltre;
use App\Services\Search\SearchJournal;
use App\Support\Search\CleDeQuartier;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2511 — ce que la publication rapporte, dit à l'annonceur sur la page de réclamation : combien de recherches des
 * {@see self::WINDOW_DAYS} derniers jours (aujourd'hui compris, la fenêtre de {@see SearchJournal::popular()}) visent le
 * quartier de ses annonces, lu dans le journal anonyme des recherches (`search_query_stats`, ADR-0088).
 *
 * - **Un compte de recherches** (`searches_count`), jamais de visiteurs ni de personnes, et rien d'une recherche : ni sa
 *   saisie, ni ses autres critères. La forme rendue est `{quarter, searches_30d}` et rien d'autre.
 * - **Rien sous le seuil** `radar.claim.demand_min_searches` : pas de « 3 recherches » qui desservirait la promesse.
 * - **Le quartier** est celui que TOUTES les annonces de la page portent (`neighborhood_id` rattaché, suivi jusqu'au
 *   quartier canonique) ; une annonce sans quartier, ou deux quartiers, et il n'y a pas de demande à dire.
 * - **Le lieu d'une recherche** est son critère `location`, rapproché du quartier par {@see CleDeQuartier}, comme le filtre
 *   de la liste ({@see QuartierDuFiltre::idsDuReferentiel()}) : le nom du quartier, ses anciens noms et ceux des quartiers
 *   fusionnés en lui. La saisie libre (`normalized_query`) n'est pas lue : la barre change déjà un lieu compris en
 *   `location`.
 */
final class ClaimDemand
{
    public const WINDOW_DAYS = 30;

    /**
     * @param  Collection<int, RadarListing>  $listings  les annonces que la page montre
     * @return array{quarter: string, searches_30d: int}|null
     */
    public function of(Collection $listings): ?array
    {
        $quarter = $this->commonQuarter($listings);
        if ($quarter === null) {
            return null;
        }

        $keys = $this->keysOf($quarter);
        $searches = 0;
        DB::table('search_query_stats')
            ->selectRaw("criteria->>'location' as location")
            ->selectRaw('sum(searches_count) as searches')
            ->where('day', '>=', now()->subDays(self::WINDOW_DAYS - 1)->toDateString())
            ->whereRaw("criteria->>'location' is not null")
            ->groupByRaw("criteria->>'location'")
            ->get()
            ->each(function (object $row) use ($keys, &$searches): void {
                if (isset($keys[(string) CleDeQuartier::de(is_string($row->location) ? $row->location : null)])) {
                    $searches += (int) $row->searches;
                }
            });

        if ($searches < max(1, (int) config('radar.claim.demand_min_searches', 50))) {
            return null;
        }

        return ['quarter' => (string) $quarter->name, 'searches_30d' => $searches];
    }

    /** @param  Collection<int, RadarListing>  $listings */
    private function commonQuarter(Collection $listings): ?GeoNeighborhood
    {
        if ($listings->isEmpty()) {
            return null;
        }
        $ids = $listings->map(fn (RadarListing $listing) => RadarReviewFields::values((array) $listing->extracted)['neighborhood_id'])->unique()->values();
        if ($ids->count() !== 1 || $ids->first() === null) {
            return null;
        }

        return GeoNeighborhood::query()->find((int) $ids->first())?->canonique();
    }

    /** @return array<string, true> les clés des noms du quartier : le sien, ses anciens noms, ceux des quartiers fusionnés en lui */
    private function keysOf(GeoNeighborhood $quarter): array
    {
        $keys = [];
        $names = GeoNeighborhood::query()
            ->whereKey($quarter->id)
            ->orWhere('merged_into_id', $quarter->id)
            ->get(['name', 'former_names'])
            ->flatMap(fn (GeoNeighborhood $n): array => [$n->name, ...($n->former_names ?? [])]);
        foreach ($names as $name) {
            $key = CleDeQuartier::de(is_string($name) ? $name : null);
            if ($key !== null) {
                $keys[$key] = true;
            }
        }

        return $keys;
    }
}
