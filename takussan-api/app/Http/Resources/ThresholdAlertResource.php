<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\ThresholdAlert;
use Illuminate\Http\Request;

/**
 * TCK-2045 (P61.04) — une ligne de la liste `GET /api/threshold-alerts`. Les colonnes PRÉSENTES seulement :
 * les sparse fieldsets (`fields[threshold_alerts]=`) décident, comme quand la liste rendait le
 * modèle brut ; les instants sortent par `iso()` (ADR-0018), et non en `.000000Z`.
 *
 * @mixin ThresholdAlert
 */
class ThresholdAlertResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var ThresholdAlert $model */
        $model = $this->resource;
        $attributes = $model->attributesToArray();

        foreach (['created_at', 'updated_at', 'last_triggered_at'] as $column) {
            if (array_key_exists($column, $attributes)) {
                $attributes[$column] = $this->iso($model->getAttribute($column));
            }
        }

        // Cast `decimal:4` : la chaîne `'10.5000'` devient le nombre `10.5`, ce qu'admet le type
        // du front (`number | string`, `lib/queries/alerts.ts`).
        foreach (['threshold', 'last_value'] as $column) {
            if (array_key_exists($column, $attributes) && $attributes[$column] !== null) {
                $attributes[$column] = (float) $attributes[$column];
            }
        }

        return $attributes;
    }
}
