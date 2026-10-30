<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/**
 * TCK-2392 — un site collecté, pour l'onglet Collecte de la console : allumé ou non, sa fréquence, ses pages au plus, et
 * l'opérateur au nom duquel ses annonces sont extraites (`include=operator`). Chaque colonne passe par `whenHas`.
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
            'operator' => $this->whenLoaded('operator', fn () => $this->operator === null ? null : [
                'id' => $this->operator->id,
                'name' => $this->operator->nameWithoutContact(),
            ]),
        ];
    }
}
