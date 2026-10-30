<?php

namespace App\Services\Radar\Observatory;

use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarAdvertiser;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2393 (ADR-0083 §5) — le classement des annonceurs du Radar : l'outil commercial du démarchage, pas un agrégat anonyme.
 *
 * Le **volume** d'un annonceur est le nombre de ses annonces vivantes — ni purgées, ni doublons d'une autre annonce
 * collectée ({@see self::liveListings()}). Pour chaque annonce, l'état courant est son dernier instantané, et à défaut (saisie
 * à la main) sa lecture relue (`extracted`) : quartier, prix, contrat.
 *
 * La **piste commerciale** suit l'annonceur jusqu'à la demande de passage en agence (`AgencyUpgradeRequest`, TCK-252) :
 * `do_not_contact` (STOP, définitif), `agency` (demande approuvée), `upgrade_pending`, `account` (un compte existe, créé par la
 * publication ou la réclamation), `contacted` (un message préparé), sinon `prospect`. La nature présumée reste dans le Radar
 * (ADR-0077 §7) : le classement la rend, rien ne l'écrit ailleurs.
 */
final class RadarAdvertiserRanking
{
    /** Les quartiers principaux rendus par annonceur. */
    public const TOP_NEIGHBORHOODS = 3;

    /** @param  EloquentBuilder<\App\Models\RadarListing>|Builder  $query  les annonces qui font le volume */
    public static function liveListings(EloquentBuilder|Builder $query, string $alias = 'radar_listings'): EloquentBuilder|Builder
    {
        return $query->whereNull("{$alias}.duplicate_of_listing_id")
            ->where("{$alias}.stage", '!=', RadarListingStage::Purged->value);
    }

    /** Le volume, en sous-requête corrélée à `radar_advertisers`. */
    public static function listingsCountQuery(): Builder
    {
        return self::liveListings(DB::table('radar_listings')->selectRaw('count(*)')
            ->whereColumn('radar_listings.radar_advertiser_id', 'radar_advertisers.id'));
    }

    /**
     * Ce que la ligne du classement rend en plus des colonnes de l'annonceur, pour une page d'annonceurs.
     *
     * @param  iterable<RadarAdvertiser>  $advertisers  `user_id`, `do_not_contact_at` et `outreaches_count` lus
     * @return array<int, array<string, mixed>> par identifiant d'annonceur
     */
    public function detailsFor(iterable $advertisers): array
    {
        $byId = collect($advertisers)->keyBy('id');
        if ($byId->isEmpty()) {
            return [];
        }
        $ids = $byId->keys()->map(fn ($id) => (int) $id)->all();

        $rows = $this->currentListings($ids)->get();
        $names = DB::table('geo_neighborhoods')->whereIn('id', $rows->pluck('neighborhood_id')->filter()->unique()->all())->pluck('name', 'id');
        $upgrades = $this->latestUpgrades($byId->pluck('user_id')->filter()->unique()->values()->all());

        $out = [];
        foreach ($byId as $id => $advertiser) {
            $own = $rows->where('advertiser_id', $id);
            $neighborhoods = $own->whereNotNull('neighborhood_id')->countBy('neighborhood_id')->sortDesc();

            $prices = [];
            foreach ($own->whereNotNull('price')->where('price', '>', 0)->groupBy(fn ($r) => $r->contract ?? 'unknown') as $contract => $group) {
                $prices[$contract] = ['min' => (int) round((float) $group->min('price')), 'max' => (int) round((float) $group->max('price'))];
            }
            ksort($prices);

            $upgrade = $advertiser->user_id === null ? null : ($upgrades[(int) $advertiser->user_id] ?? null);

            $out[(int) $id] = [
                'neighborhoods_count' => $neighborhoods->count(),
                'top_neighborhoods' => $neighborhoods->take(self::TOP_NEIGHBORHOODS)
                    ->map(fn (int $count, $nid) => ['id' => (int) $nid, 'name' => $names[$nid] ?? null, 'listings' => $count])
                    ->values()->all(),
                'price_ranges' => $prices,
                'sites' => $own->pluck('source_site')->map(fn ($s) => (string) $s)->unique()->sort()->values()->all(),
                'upgrade_status' => $upgrade,
                'pipeline' => $this->pipeline($advertiser, $upgrade),
            ];
        }

        return $out;
    }

    /** @param  list<int>  $advertiserIds */
    private function currentListings(array $advertiserIds): Builder
    {
        $latest = DB::table('radar_listing_snapshots as s')
            ->selectRaw('distinct on (s.radar_listing_id) s.radar_listing_id, s.price, s.contract, s.geo_neighborhood_id')
            ->orderBy('s.radar_listing_id')->orderByDesc('s.first_seen_at')->orderByDesc('s.id');

        $number = fn (string $path) => "case when jsonb_typeof(l.extracted #> '{$path}') = 'number' then (l.extracted #>> '{$path}')::numeric end";

        return self::liveListings(DB::table('radar_listings as l'), 'l')
            ->leftJoinSub($latest, 'c', 'c.radar_listing_id', '=', 'l.id')
            ->whereIn('l.radar_advertiser_id', $advertiserIds)
            ->selectRaw('l.radar_advertiser_id as advertiser_id, l.source_site')
            ->selectRaw('coalesce(c.geo_neighborhood_id, ('.$number('{neighborhood,neighborhood_id}').')::bigint) as neighborhood_id')
            ->selectRaw('coalesce(c.price, '.$number('{price,value}').') as price')
            ->selectRaw("coalesce(c.contract, l.extracted #>> '{contract,value}') as contract");
    }

    /**
     * La dernière demande de passage en agence de chaque utilisateur (celui qui l'a soumise).
     *
     * @param  list<int>  $userIds
     * @return array<int, string> statut par utilisateur
     */
    private function latestUpgrades(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        return AgencyUpgradeRequest::query()
            ->whereIn('submitted_by', $userIds)
            ->orderBy('submitted_by')->orderByDesc('created_at')->orderByDesc('id')
            ->get(['submitted_by', 'status'])
            ->unique('submitted_by')
            ->mapWithKeys(fn (AgencyUpgradeRequest $r) => [(int) $r->submitted_by => $r->status instanceof AgencyUpgradeRequestStatus ? $r->status->value : (string) $r->status])
            ->all();
    }

    private function pipeline(RadarAdvertiser $advertiser, ?string $upgrade): string
    {
        return match (true) {
            $advertiser->do_not_contact_at !== null => 'do_not_contact',
            $upgrade === AgencyUpgradeRequestStatus::Approved->value => 'agency',
            $upgrade === AgencyUpgradeRequestStatus::Pending->value => 'upgrade_pending',
            $advertiser->user_id !== null => 'account',
            (int) $advertiser->getAttribute('outreaches_count') > 0 => 'contacted',
            default => 'prospect',
        };
    }
}
