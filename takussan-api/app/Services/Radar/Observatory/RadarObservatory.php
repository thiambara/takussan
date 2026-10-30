<?php

namespace App\Services\Radar\Observatory;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\Property;
use Carbon\CarbonInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2393 (ADR-0083 §1, §2) — l'observatoire du marché, calculé à la lecture.
 *
 * **Le marché** est l'ensemble des annonces collectées qui ont au moins un instantané, doublons exclus
 * (`duplicate_of_listing_id` : la même maison vue sur trois sites est UNE annonce). L'état courant d'une annonce est son
 * dernier instantané ; sa présence va du premier `first_seen_at` au dernier `last_seen_at`.
 *
 * **Sur les données conservées** : toute purge supprime les instantanés de l'annonce (TCK-2392, ADR-0080 §4) ; une annonce
 * purgée quitte donc le marché, et la période couverte est bornée par la rétention (90 jours pour une annonce jamais
 * publiée). Un historique au-delà passera par des compteurs anonymes agrégés (TCK-2434). Les sections du marché
 * (`summary`, `price_per_m2`, `time_on_market`, `supply_gap`, `gone_sources`) ne lisent que `radar_listing_snapshots`, les
 * colonnes anonymes de `radar_listings` (site, doublon, rattachement au catalogue, disparition), le référentiel des
 * quartiers et le catalogue public. Jamais le texte brut, l'extraction, l'adresse de la source, le numéro ni le nom —
 * `RadarObservatoryTest` le vérifie sur le SQL émis.
 *
 * `natures` fait exception, et le dit : la nature présumée vit sur l'annonceur, que la purge vide (TCK-2431).
 */
final class RadarObservatory
{
    public const SECTIONS = ['summary', 'price_per_m2', 'time_on_market', 'supply_gap', 'natures', 'gone_sources'];

    /** Les sources disparues de biens rendues au plus, des plus récentes aux plus anciennes. */
    public const GONE_SOURCES_LIMIT = 50;

    /**
     * @param  list<string>  $sections
     * @param  array{since?: CarbonInterface|null, contract?: string|null, property_type?: string|null, source_site?: string|null, neighborhood_id?: int|null}  $filters
     * @return array<string, mixed>
     */
    public function compute(array $sections, array $filters): array
    {
        $out = [];
        foreach (array_values(array_intersect(self::SECTIONS, $sections)) as $section) {
            $out[$section] = match ($section) {
                'summary' => $this->summary($filters),
                'price_per_m2' => $this->pricePerM2($filters),
                'time_on_market' => $this->timeOnMarket($filters),
                'supply_gap' => $this->supplyGap($filters),
                'natures' => $this->natures(),
                'gone_sources' => $this->goneSources($filters),
            };
        }

        return $out;
    }

    // --- Le marché ---------------------------------------------------------------------------------

    /**
     * Une ligne par annonce du marché, filtres appliqués : `listing_id`, `source_site`, `gone_at`, `in_catalog`, l'état courant
     * (`price`, `rent_period`, `contract`, `property_type`, `surface_m2`, `geo_neighborhood_id`) et la présence
     * (`first_seen`, `last_seen`).
     *
     * @param  array<string, mixed>  $filters
     */
    private function market(array $filters): Builder
    {
        $latest = DB::table('radar_listing_snapshots as s')
            ->selectRaw('distinct on (s.radar_listing_id) s.radar_listing_id, s.price, s.rent_period, s.contract, s.property_type, s.surface_m2, s.geo_neighborhood_id')
            ->orderBy('s.radar_listing_id')->orderByDesc('s.first_seen_at')->orderByDesc('s.id');
        $presence = DB::table('radar_listing_snapshots')
            ->selectRaw('radar_listing_id, min(first_seen_at) as first_seen, max(last_seen_at) as last_seen')
            ->groupBy('radar_listing_id');

        return DB::table('radar_listings as l')
            ->joinSub($latest, 'c', 'c.radar_listing_id', '=', 'l.id')
            ->joinSub($presence, 'p', 'p.radar_listing_id', '=', 'l.id')
            ->whereNull('l.duplicate_of_listing_id')
            ->selectRaw('l.id as listing_id, l.source_site, l.source_gone_at as gone_at')
            ->selectRaw('(l.property_id is not null or l.duplicate_of_property_id is not null) as in_catalog')
            ->addSelect(['c.price', 'c.rent_period', 'c.contract', 'c.property_type', 'c.surface_m2', 'c.geo_neighborhood_id', 'p.first_seen', 'p.last_seen'])
            ->when($filters['since'] ?? null, fn (Builder $q, CarbonInterface $since) => $q->where('p.last_seen', '>=', $since))
            ->when($filters['contract'] ?? null, fn (Builder $q, string $v) => $q->where('c.contract', $v))
            ->when($filters['property_type'] ?? null, fn (Builder $q, string $v) => $q->where('c.property_type', $v))
            ->when($filters['source_site'] ?? null, fn (Builder $q, string $v) => $q->where('l.source_site', $v))
            ->when($filters['neighborhood_id'] ?? null, fn (Builder $q, int $v) => $q->where('c.geo_neighborhood_id', $v));
    }

    /** @param  array<string, mixed>  $filters */
    private function fromMarket(array $filters): Builder
    {
        return DB::query()->fromSub($this->market($filters), 'm');
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{listings: int, online: int, gone: int, in_catalog: int, sites: list<string>}
     */
    private function summary(array $filters): array
    {
        $row = $this->fromMarket($filters)
            ->selectRaw('count(*) as listings')
            ->selectRaw('count(*) filter (where m.gone_at is null) as online')
            ->selectRaw('count(*) filter (where m.gone_at is not null) as gone')
            ->selectRaw('count(*) filter (where m.in_catalog) as in_catalog')
            ->first();
        $sites = $this->fromMarket($filters)->distinct()->orderBy('m.source_site')->pluck('m.source_site')->map(fn ($s) => (string) $s)->all();

        return [
            'listings' => (int) $row->listings,
            'online' => (int) $row->online,
            'gone' => (int) $row->gone,
            'in_catalog' => (int) $row->in_catalog,
            'sites' => $sites,
        ];
    }

    /**
     * Le prix au m² : par quartier, type, contrat et période, la médiane et les quartiles du prix du dernier instantané rapporté
     * à sa surface. Seules comptent les annonces dont prix et surface sont connus et positifs. Aucun seuil d'échantillon : le
     * compte est rendu, le lecteur juge.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array<string, mixed>>
     */
    private function pricePerM2(array $filters): array
    {
        return $this->fromMarket($filters)
            ->leftJoin('geo_neighborhoods as g', 'g.id', '=', 'm.geo_neighborhood_id')
            ->where('m.price', '>', 0)->where('m.surface_m2', '>', 0)
            ->groupBy('m.geo_neighborhood_id', 'g.name', 'm.property_type', 'm.contract', 'm.rent_period')
            ->select(['m.geo_neighborhood_id', 'g.name as neighborhood_name', 'm.property_type', 'm.contract', 'm.rent_period'])
            ->selectRaw('count(*) as listings')
            ->selectRaw('percentile_cont(0.5) within group (order by m.price / m.surface_m2) as median')
            ->selectRaw('percentile_cont(0.25) within group (order by m.price / m.surface_m2) as p25')
            ->selectRaw('percentile_cont(0.75) within group (order by m.price / m.surface_m2) as p75')
            ->orderByDesc('listings')->orderBy('m.geo_neighborhood_id')->orderBy('m.property_type')->orderBy('m.contract')->orderBy('m.rent_period')
            ->get()
            ->map(fn ($r) => $this->groupKey($r) + [
                'rent_period' => $r->rent_period,
                'listings' => (int) $r->listings,
                'median_xof_per_m2' => (int) round((float) $r->median),
                'p25_xof_per_m2' => (int) round((float) $r->p25),
                'p75_xof_per_m2' => (int) round((float) $r->p75),
            ])
            ->all();
    }

    /**
     * Le temps de mise sur le marché : la présence (premier → dernier instantané) des annonces dont la disparition est
     * CONSTATÉE (`source_gone_at`, un passage qui a lu toute la liste). Les annonces encore en ligne sont comptées à part,
     * sans durée. Censuré à gauche : une annonce déjà en ligne avant le premier passage semble plus récente (ADR-0083).
     *
     * @param  array<string, mixed>  $filters
     * @return list<array<string, mixed>>
     */
    private function timeOnMarket(array $filters): array
    {
        $days = 'extract(epoch from (m.last_seen - m.first_seen)) / 86400.0';

        return $this->fromMarket($filters)
            ->leftJoin('geo_neighborhoods as g', 'g.id', '=', 'm.geo_neighborhood_id')
            ->groupBy('m.geo_neighborhood_id', 'g.name', 'm.property_type', 'm.contract')
            ->select(['m.geo_neighborhood_id', 'g.name as neighborhood_name', 'm.property_type', 'm.contract'])
            ->selectRaw('count(*) filter (where m.gone_at is not null) as gone')
            ->selectRaw('count(*) filter (where m.gone_at is null) as online')
            ->selectRaw("percentile_cont(0.5) within group (order by {$days}) filter (where m.gone_at is not null) as median_days")
            ->selectRaw("avg({$days}) filter (where m.gone_at is not null) as mean_days")
            ->orderByDesc('gone')->orderByDesc('online')->orderBy('m.geo_neighborhood_id')->orderBy('m.property_type')->orderBy('m.contract')
            ->get()
            ->map(fn ($r) => $this->groupKey($r) + [
                'gone' => (int) $r->gone,
                'online' => (int) $r->online,
                'median_days' => $r->median_days === null ? null : round((float) $r->median_days, 1),
                'mean_days' => $r->mean_days === null ? null : round((float) $r->mean_days, 1),
            ])
            ->all();
    }

    /**
     * L'écart d'offre par quartier du référentiel : les annonces du marché en ligne et hors catalogue (ni publiées, ni doublon
     * d'un bien) contre les biens publics du même quartier (adresse du bien). Trié du plus grand manque au plus petit.
     * Le contrat et le type filtrent les deux côtés ; le site et la date ne filtrent que le Radar.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array<string, mixed>>
     */
    private function supplyGap(array $filters): array
    {
        $radar = $this->fromMarket($filters)
            ->whereNull('m.gone_at')->where('m.in_catalog', false)->whereNotNull('m.geo_neighborhood_id')
            ->groupBy('m.geo_neighborhood_id')
            ->selectRaw('m.geo_neighborhood_id, count(*) as radar_online')
            ->pluck('radar_online', 'geo_neighborhood_id');

        $catalog = Property::query()->public()
            ->join('addresses as a', fn ($join) => $join
                ->on('a.addressable_id', '=', 'properties.id')
                ->where('a.addressable_type', (new Property)->getMorphClass()))
            ->whereNotNull('a.geo_neighborhood_id')
            ->when($filters['contract'] ?? null, fn ($q, string $v) => $q->where('properties.contract_type', $v))
            ->when($filters['property_type'] ?? null, fn ($q, string $v) => $q->where('properties.type', $v))
            ->when($filters['neighborhood_id'] ?? null, fn ($q, int $v) => $q->where('a.geo_neighborhood_id', $v))
            ->groupBy('a.geo_neighborhood_id')
            ->toBase()
            ->selectRaw('a.geo_neighborhood_id, count(distinct properties.id) as catalog_public')
            ->pluck('catalog_public', 'geo_neighborhood_id');

        $ids = collect($radar->keys())->merge($catalog->keys())->map(fn ($id) => (int) $id)->unique()->values();
        $names = DB::table('geo_neighborhoods')->whereIn('id', $ids->all())->pluck('name', 'id');

        return $ids
            ->map(fn (int $id) => [
                'neighborhood' => ['id' => $id, 'name' => $names[$id] ?? null],
                'radar_online' => (int) ($radar[$id] ?? 0),
                'catalog_public' => (int) ($catalog[$id] ?? 0),
                'gap' => (int) ($radar[$id] ?? 0) - (int) ($catalog[$id] ?? 0),
            ])
            ->sortBy([['gap', 'desc'], ['radar_online', 'desc'], fn ($a, $b) => $a['neighborhood']['id'] <=> $b['neighborhood']['id']])
            ->values()
            ->all();
    }

    /**
     * Les annonceurs par nature présumée — la part d'intermédiaires (ADR-0077 §7) — parmi ceux qui portent au moins une
     * annonce non purgée et qui n'est pas un doublon. Toutes les natures sont rendues, zéro compris.
     *
     * @return array<string, int>
     */
    private function natures(): array
    {
        $counts = DB::table('radar_advertisers as a')
            ->whereExists(fn (Builder $q) => $q->select(DB::raw(1))->from('radar_listings as l')
                ->whereColumn('l.radar_advertiser_id', 'a.id')
                ->whereNull('l.duplicate_of_listing_id')
                ->where('l.stage', '!=', RadarListingStage::Purged->value))
            ->groupBy('a.nature')
            ->selectRaw('a.nature, count(*) as total')
            ->pluck('total', 'nature');

        $out = [];
        foreach (RadarAdvertiserNature::cases() as $nature) {
            $out[$nature->value] = (int) ($counts[$nature->value] ?? 0);
        }

        return $out;
    }

    /**
     * Les sources disparues qui représentent un bien (publié par le Radar, ou dont l'annonce est le doublon) : ce que
     * l'alerte `radar_source_listing_gone` a signalé, à relire. Le site et la date filtrent ; le contrat et le type, non.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array<string, mixed>>
     */
    private function goneSources(array $filters): array
    {
        $public = Property::query()->public()->select('properties.id');

        return DB::table('radar_listings as l')
            ->leftJoin('radar_listings as pl', 'pl.id', '=', 'l.duplicate_of_listing_id')
            ->join('properties as p', 'p.id', '=', DB::raw('coalesce(l.property_id, pl.property_id, l.duplicate_of_property_id)'))
            ->whereNotNull('l.source_gone_at')
            ->whereNull('p.deleted_at')
            ->when($filters['since'] ?? null, fn (Builder $q, CarbonInterface $since) => $q->where('l.source_gone_at', '>=', $since))
            ->when($filters['source_site'] ?? null, fn (Builder $q, string $v) => $q->where('l.source_site', $v))
            ->select(['l.id as listing_id', 'l.source_site', 'l.source_gone_at', 'p.id as property_id', 'p.title as property_title'])
            ->selectRaw('p.id in ('.$public->toSql().') as property_public', $public->getBindings())
            ->orderByDesc('l.source_gone_at')->orderByDesc('l.id')
            ->limit(self::GONE_SOURCES_LIMIT)
            ->get()
            ->map(fn ($r) => [
                'listing_id' => (int) $r->listing_id,
                'source_site' => (string) $r->source_site,
                'gone_at' => BaseResource::instantOnWire(Carbon::parse($r->source_gone_at)),
                'property' => ['id' => (int) $r->property_id, 'title' => $r->property_title, 'public' => (bool) $r->property_public],
            ])
            ->all();
    }

    /** @return array{neighborhood: array{id: int, name: string|null}|null, property_type: string|null, contract: string|null} */
    private function groupKey(object $row): array
    {
        return [
            'neighborhood' => $row->geo_neighborhood_id === null ? null : ['id' => (int) $row->geo_neighborhood_id, 'name' => $row->neighborhood_name],
            'property_type' => $row->property_type,
            'contract' => $row->contract,
        ];
    }
}
