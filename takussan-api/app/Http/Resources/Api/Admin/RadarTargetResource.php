<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Radar\Targets\RadarTargetCriteria;
use Illuminate\Http\Request;

/**
 * TCK-2468 (ADR-0087 §5) — une cible du Radar pour la console. `criteria` est la forme normalisée de
 * `RadarTargetCriteria` (toutes les clés présentes). Chaque colonne passe par `whenHas` : sous un sparse fieldset
 * (`fields[radar_targets]=…`), une colonne non lue est omise.
 */
class RadarTargetResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->whenHas('id'),
            'name' => $this->whenHas('name'),
            'origin' => $this->whenHas('origin', fn () => $this->enumValue($this->origin)),
            'status' => $this->whenHas('status', fn () => $this->enumValue($this->status)),
            'pinned' => $this->whenHas('pinned'),
            'criteria' => $this->whenHas('criteria', fn () => RadarTargetCriteria::ordered((array) $this->criteria)),
            'demand_count' => $this->whenHas('demand_count'),
            'matches_count' => $this->whenHas('matches_count'),
            'last_matched_at' => $this->whenHas('last_matched_at', fn () => $this->iso($this->last_matched_at)),
            'created_at' => $this->whenHas('created_at', fn () => $this->iso($this->created_at)),
            'updated_at' => $this->whenHas('updated_at', fn () => $this->iso($this->updated_at)),
        ];
    }
}
