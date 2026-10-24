<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\KpiConfig;
use Illuminate\Http\Request;

/**
 * TCK-2045 (P61.04) — une ligne de la liste `GET /api/kpi-configs`. Les colonnes PRÉSENTES seulement :
 * les sparse fieldsets (`fields[kpi_configs]=`) décident, comme quand la liste rendait le
 * modèle brut ; les instants sortent par `iso()` (ADR-0018), et non en `.000000Z`.
 *
 * @mixin KpiConfig
 */
class KpiConfigResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var KpiConfig $model */
        $model = $this->resource;
        $attributes = $model->attributesToArray();

        foreach (['created_at', 'updated_at'] as $column) {
            if (array_key_exists($column, $attributes)) {
                $attributes[$column] = $this->iso($model->getAttribute($column));
            }
        }

        // `include=agency` est accepté (`$requestLoadable`) : le modèle brut l'émettait. Il sort ici
        // réduit à son identité, et jamais en ligne `agencies` entière.
        $attributes['agency'] = $this->whenLoaded('agency', fn () => $model->agency === null ? null : [
            'id' => $model->agency->id,
            'name' => $model->agency->name,
        ]);

        return $attributes;
    }
}
