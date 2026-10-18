<?php

namespace App\Services\Boost;

use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Property\PropertyViewCounter;
use App\Support\VisitorFingerprint;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

/**
 * TCK-633 lot F (ADR-0061 §10) — compteurs d'impressions et de clics, en cache par boost et par
 * HEURE UTC (incrément atomique du magasin), versés par `boosts:tick` dans
 * `property_boost_daily_stats`. Seules les heures COMPLÈTES se versent ; chaque clé versée est
 * retirée après l'écriture de sa ligne : un tick rejoué n'ajoute rien, et une écriture qui lève ne
 * perd rien (TCK-793).
 */
final class BoostStatsRecorder
{
    public const TTL_HOURS = 48;

    public const LAST_FLUSHED_KEY = 'boost-stats:last-flushed-hour';

    /** TCK-708 — fenêtre où un même visiteur ne compte qu'une impression par bien. */
    public const IMPRESSION_WINDOW_MINUTES = 30;

    /**
     * TCK-708 — les biens servis par la requête en cours, tant que `boost.impressions` diffère le
     * comptage ; `null` hors de ce middleware (appel direct, console) : le comptage est immédiat.
     *
     * @var list<int>|null
     */
    private ?array $pending = null;

    /** @param  list<int>  $propertyIds  biens servis dans un emplacement « Sponsorisé » */
    public function impressions(array $propertyIds): void
    {
        if ($this->pending !== null) {
            array_push($this->pending, ...array_map('intval', $propertyIds));

            return;
        }
        $counts = array_count_values(array_map('intval', $propertyIds));
        foreach ($this->liveFeaturedBoosts(array_keys($counts)) as $propertyId => $boostId) {
            $this->add($boostId, 'impressions', $counts[$propertyId]);
        }
    }

    /** TCK-708 — les impressions suivantes attendent `commitImpressions()` ou `discardImpressions()`. */
    public function deferImpressions(): void
    {
        $this->pending = [];
    }

    /**
     * TCK-708 (P01.04, décision du porteur) — une impression par visiteur et par bien sur 30 min.
     * Sans visiteur connu (aucune IP), chaque bien servi compte une fois, sans dédoublonnage.
     */
    public function commitImpressions(?string $visitor): void
    {
        $propertyIds = array_values(array_unique($this->pending ?? []));
        $this->pending = null;

        if ($visitor !== null) {
            $propertyIds = array_values(array_filter(
                $propertyIds,
                fn (int $id) => Cache::add('boost-impression:'.$visitor.':'.$id, true, now()->addMinutes(self::IMPRESSION_WINDOW_MINUTES)),
            ));
        }

        $this->impressions($propertyIds);
    }

    /** TCK-708 — la réponse n'a rien servi (304, exception) : rien ne se compte. */
    public function discardImpressions(): void
    {
        $this->pending = null;
    }

    /**
     * TCK-794 (P18.06, décision du porteur) — au plus trois clics par bien, par IP et par heure,
     * comme les vues de fiche : derrière un NAT d'opérateur, plusieurs visiteurs partagent une IP.
     * TCK-851 (P37.01) — l'IP d'une IPv6 est son /64.
     */
    public function click(Property $property, string $ip): void
    {
        if (RateLimiter::hit('boost-click:'.$property->getKey().':'.VisitorFingerprint::network($ip), PropertyViewCounter::FENETRE_SECONDES) > PropertyViewCounter::MAX_PAR_HEURE) {
            return;
        }
        foreach ($this->liveFeaturedBoosts([(int) $property->getKey()]) as $boostId) {
            $this->add($boostId, 'clicks', 1);
        }
    }

    public static function key(int $boostId, CarbonInterface $hour, string $metric): string
    {
        return 'boost-stats:'.$boostId.':'.$hour->copy()->utc()->format('Y-m-d-H').':'.$metric;
    }

    /** Verse les heures complètes non encore versées. Rend le nombre de lignes touchées. */
    public function flush(): int
    {
        $current = now()->utc()->startOfHour();
        $last = Cache::get(self::LAST_FLUSHED_KEY);
        $hour = is_string($last)
            ? Carbon::createFromFormat('Y-m-d-H', $last, 'UTC')->startOfHour()->addHour()
            : $current->copy()->subHours(self::TTL_HOURS);
        $touched = 0;

        for (; $hour->lt($current); $hour->addHour()) {
            $end = $hour->copy()->addHour();
            $boostIds = PropertyBoost::query()
                ->where('kind', BoostKind::Featured)
                ->where('starts_at', '<', $end)
                ->where(fn ($q) => $q->whereNull('ended_at')->orWhere('ended_at', '>=', $hour))
                ->pluck('id');

            foreach ($boostIds as $boostId) {
                // TCK-793 (P18.05) — lus, écrits, PUIS retirés : une écriture qui lève laisse les
                // compteurs au tick suivant, au lieu de les perdre comme le faisait `pull`.
                $keys = [self::key($boostId, $hour, 'impressions'), self::key($boostId, $hour, 'clicks')];
                $impressions = (int) Cache::get($keys[0], 0);
                $clicks = (int) Cache::get($keys[1], 0);
                if ($impressions === 0 && $clicks === 0) {
                    continue;
                }
                DB::table('property_boost_daily_stats')->upsert(
                    [[
                        'property_boost_id' => $boostId, 'date' => $hour->toDateString(),
                        'impressions' => $impressions, 'clicks' => $clicks,
                        'created_at' => now(), 'updated_at' => now(),
                    ]],
                    ['property_boost_id', 'date'],
                    [
                        'impressions' => DB::raw('property_boost_daily_stats.impressions + excluded.impressions'),
                        'clicks' => DB::raw('property_boost_daily_stats.clicks + excluded.clicks'),
                        'updated_at' => DB::raw('excluded.updated_at'),
                    ],
                );
                Cache::deleteMultiple($keys);
                $touched++;
            }
            Cache::forever(self::LAST_FLUSHED_KEY, $hour->format('Y-m-d-H'));
        }

        return $touched;
    }

    private function add(int $boostId, string $metric, int $by): void
    {
        $key = self::key($boostId, now(), $metric);
        Cache::add($key, 0, now()->addHours(self::TTL_HOURS));
        Cache::increment($key, $by);
    }

    /**
     * @param  list<int>  $propertyIds
     * @return array<int, int> property_id => boost_id
     */
    private function liveFeaturedBoosts(array $propertyIds): array
    {
        if ($propertyIds === []) {
            return [];
        }

        return PropertyBoost::query()
            ->whereIn('property_id', $propertyIds)
            ->where('kind', BoostKind::Featured)
            ->where('status', BoostStatus::Active)
            ->pluck('id', 'property_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
