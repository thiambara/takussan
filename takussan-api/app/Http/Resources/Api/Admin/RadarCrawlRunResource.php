<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/**
 * TCK-2392 — un passage de collecte, pour l'onglet Collecte : ce qu'il a lu, trouvé, et le code de son arrêt
 * (`stop_reason`, `radar.crawl.*` ou `radar.fetch.*` — le front le traduit). Chaque colonne passe par `whenHas`.
 */
class RadarCrawlRunResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->whenHas('id'),
            'site' => $this->whenHas('site', fn () => $this->enumValue($this->site)),
            'trigger' => $this->whenHas('trigger', fn () => $this->enumValue($this->trigger)),
            'status' => $this->whenHas('status', fn () => $this->enumValue($this->status)),
            'operator_id' => $this->whenHas('operator_id'),
            'started_at' => $this->whenHas('started_at', fn () => $this->iso($this->started_at)),
            'finished_at' => $this->whenHas('finished_at', fn () => $this->iso($this->finished_at)),
            'pages_read' => $this->whenHas('pages_read'),
            'cards_seen' => $this->whenHas('cards_seen'),
            'listings_created' => $this->whenHas('listings_created'),
            'listings_known' => $this->whenHas('listings_known'),
            'snapshots_opened' => $this->whenHas('snapshots_opened'),
            'reached_end' => $this->whenHas('reached_end'),
            'stop_reason' => $this->whenHas('stop_reason'),
            'created_at' => $this->whenHas('created_at', fn () => $this->iso($this->created_at)),
        ];
    }
}
