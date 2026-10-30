<?php

namespace App\Services\Radar\Crawl;

use App\Models\Enums\RadarSourceSite;
use App\Models\RadarCrawlSource;
use Illuminate\Support\Collection;
use InvalidArgumentException;

/**
 * TCK-2392 — les sites collectés : ceux de `radar.crawl.sites`, chacun avec son adaptateur et sa ligne de
 * `radar_crawl_sources`. La ligne d'un site configuré se crée à la première lecture, ÉTEINTE (`insertOrIgnore` : deux
 * lectures simultanées n'en créent qu'une) ; un site de plus (TCK-2424) n'a donc besoin d'aucune migration.
 */
final class RadarCrawlSources
{
    /** @return list<RadarSourceSite> les sites configurés, dans l'ordre de la configuration */
    public function sites(): array
    {
        $sites = [];
        foreach (array_keys((array) config('radar.crawl.sites', [])) as $site) {
            $case = RadarSourceSite::tryFrom((string) $site);
            if ($case !== null) {
                $sites[] = $case;
            }
        }

        return $sites;
    }

    public function has(string $site): bool
    {
        return in_array($site, array_map(fn (RadarSourceSite $s) => $s->value, $this->sites()), true);
    }

    public function adapter(RadarSourceSite $site): RadarSiteAdapter
    {
        $class = config("radar.crawl.sites.{$site->value}.adapter");
        if (! is_string($class) || ! is_subclass_of($class, RadarSiteAdapter::class)) {
            throw new InvalidArgumentException("Aucun adaptateur de collecte pour le site {$site->value}.");
        }

        return app($class);
    }

    /**
     * Les lignes des sites configurés, créées éteintes au besoin, dans l'ordre de la configuration.
     *
     * @return Collection<int, RadarCrawlSource>
     */
    public function all(): Collection
    {
        $sites = array_map(fn (RadarSourceSite $s) => $s->value, $this->sites());
        if ($sites === []) {
            return collect();
        }

        $now = now();
        RadarCrawlSource::query()->insertOrIgnore(array_map(fn (string $site) => [
            'site' => $site,
            'enabled' => false,
            'frequency_minutes' => (int) config('radar.crawl.default_frequency_minutes', 360),
            'max_pages' => (int) config('radar.crawl.default_max_pages', 5),
            'created_at' => $now,
            'updated_at' => $now,
        ], $sites));

        $rank = array_flip($sites);

        return RadarCrawlSource::query()->whereIn('site', $sites)->get()
            ->sortBy(fn (RadarCrawlSource $source) => $rank[$source->site->value])
            ->values();
    }

    public function find(string $site): ?RadarCrawlSource
    {
        return $this->has($site) ? $this->all()->first(fn (RadarCrawlSource $s) => $s->site->value === $site) : null;
    }
}
