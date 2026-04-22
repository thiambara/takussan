<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * GeoJSON Feature representation of a Property on the public map.
 * The caller wraps a collection of these into a FeatureCollection.
 */
class PropertyMapGeoJsonResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        $address = $this->resource->relationLoaded('address')
            ? $this->resource->address
            : $this->resource->address;

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
                'thumbnail' => $this->resource->getFirstMediaUrl('photos', 'thumbnail') ?: null,
            ],
        ];
    }
}
