<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\RadarCrawlDiscovery;
use App\Models\Enums\RadarSourceSite;
use App\Services\Radar\Crawl\RadarCrawlSources;
use App\Services\Radar\Crawl\RadarSiteAdapter;
use Illuminate\Http\Request;

/**
 * TCK-2392 — un site collecté, pour l'onglet Collecte de la console : allumé ou non, sa fréquence, ses pages au plus, et
 * l'opérateur au nom duquel ses annonces sont extraites (`include=operator`). Chaque colonne passe par `whenHas`.
 *
 * TCK-2438 — `start_urls` : les URL de départ réglées (null : celle de la configuration). Avec `site`, deux valeurs du
 * code pour le formulaire : `default_start_url` (celle de la configuration) et `start_hosts` (les hôtes permis).
 *
 * TCK-2468 — `scope` : `targeted` ou `all` (ADR-0087 §5).
 *
 * TCK-2467 — `discovery` : ce que la source suit VRAIMENT (`sitemap` ou `lists`, son réglage ou à défaut celui de
 * l'adaptateur, ADR-0087 §4) ; avec `site`, `sitemap_available` : l'adaptateur déclare-t-il des sitemaps, et
 * `max_new_per_run` : le plafond d'URL neuves d'un passage (`radar.crawl.max_new_per_run`), que la console cite.
 */
class RadarCrawlSourceResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->whenHas('id'),
            'site' => $this->whenHas('site', fn () => $this->enumValue($this->site)),
            'enabled' => $this->whenHas('enabled'),
            'frequency_minutes' => $this->whenHas('frequency_minutes'),
            'max_pages' => $this->whenHas('max_pages'),
            'operator_id' => $this->whenHas('operator_id'),
            'enabled_at' => $this->whenHas('enabled_at', fn () => $this->iso($this->enabled_at)),
            'updated_at' => $this->whenHas('updated_at', fn () => $this->iso($this->updated_at)),
            'start_urls' => $this->whenHas('start_urls'),
            'scope' => $this->whenHas('scope', fn () => $this->enumValue($this->scope)),
            'discovery' => $this->whenHas('discovery', fn () => ($adapter = $this->adapter()) === null
                ? $this->enumValue($this->discovery)
                : RadarCrawlDiscovery::effective($this->discovery, $adapter)->value),
            'sitemap_available' => $this->whenHas('site', fn () => ($this->adapter()?->sitemapUrls() ?? []) !== []),
            'default_start_url' => $this->whenHas('site', fn () => $this->adapter()?->startUrl()),
            'start_hosts' => $this->whenHas('site', fn () => $this->adapter()?->startHosts() ?? []),
            'max_new_per_run' => $this->whenHas('site', fn () => max(0, (int) config('radar.crawl.max_new_per_run', 200))),
            'operator' => $this->whenLoaded('operator', fn () => $this->operator === null ? null : [
                'id' => $this->operator->id,
                'name' => $this->operator->nameWithoutContact(),
            ]),
        ];
    }

    /** L'adaptateur du site ; null pour un site que la configuration ne collecte plus. */
    private function adapter(): ?RadarSiteAdapter
    {
        $sources = app(RadarCrawlSources::class);

        return $this->site instanceof RadarSourceSite && $sources->has($this->site->value) ? $sources->adapter($this->site) : null;
    }
}
