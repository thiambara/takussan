<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
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
            'default_start_url' => $this->whenHas('site', fn () => $this->adapter()?->startUrl()),
            'start_hosts' => $this->whenHas('site', fn () => $this->adapter()?->startHosts() ?? []),
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
