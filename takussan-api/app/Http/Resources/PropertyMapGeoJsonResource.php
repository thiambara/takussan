<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Media\WatermarkRequirement;
use Illuminate\Http\Request;

/**
 * GeoJSON Feature representation of a Property on the public map.
 * The caller wraps a collection of these into a FeatureCollection.
 */
class PropertyMapGeoJsonResource extends BaseResource
{
    public static $wrap = null;

    /** TCK-539 (R2) — la vignette décide du filigrane en une requête pour toute la carte. */
    public static function collection($resource)
    {
        WatermarkRequirement::attach($resource);

        return parent::collection($resource);
    }

    public function toArray(Request $request): array
    {
        $address = $this->resource->address;

        $lat = $address?->latitude !== null ? (float) $address->latitude : null;
        $lng = $address?->longitude !== null ? (float) $address->longitude : null;

        return [
            'type' => 'Feature',
            'geometry' => [
                'type' => 'Point',
                'coordinates' => [$lng, $lat],
            ],
            'properties' => [
                'id' => $this->resource->id,
                'title' => $this->resource->title,
                'slug' => $this->resource->slug,
                'price' => (float) $this->resource->price,
                'currency' => $this->resource->currency?->value,
                'type' => $this->resource->type?->value,
                'contract_type' => $this->resource->contract_type?->value,
                // `thumbnail` est synchrone, mais `getFirstMediaUrl()` construit l'URL sans
                // vérifier la conversion : une conversion ratée donnait un 404 (TCK-539).
                'thumbnail' => ($photo = $this->resource->getFirstMedia('photos')) !== null
                    ? PublicPhotoUrl::upTo($photo, 'thumbnail', fn () => $this->resource->requiresWatermark())
                    : null,
            ],
        ];
    }
}
