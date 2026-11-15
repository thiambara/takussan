<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Property;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Property\PropertyModerationChecks;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-2672 — `GET /api/properties/moderation/{property}` : le bien soumis vu EN ENTIER (description,
 * toutes ses photos, adresse, prix, type, transaction), qui l'a soumis, et la liste de contrôle
 * ({@see PropertyModerationChecks}). Une ressource à part : la forme « liste » de
 * `PropertyResource` reste celle de la file.
 *
 * @property Property $resource
 */
class PropertyModerationDetailResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var Property $property */
        $property = $this->resource;
        $checks = app(PropertyModerationChecks::class);
        $address = $property->address;
        $watermark = fn () => $property->requiresWatermark();

        return [
            'id' => $property->id,
            'reference_number' => $property->reference_number,
            'title' => $property->title,
            'slug' => $property->slug,
            'status' => $this->enumValue($property->status),
            'type' => $this->enumValue($property->type),
            'contract_type' => $this->enumValue($property->contract_type),
            'rent_period' => $this->enumValue($property->rent_period),
            'price' => $property->price !== null ? (float) $property->price : null,
            'currency' => $property->currency,
            'area' => $property->area !== null ? (float) $property->area : null,
            'bedrooms' => $property->bedrooms,
            'bathrooms' => $property->bathrooms,
            'description' => $property->description,
            'photos' => $property->getMedia('photos')->map(fn (Media $media) => [
                'id' => $media->id,
                'url' => PublicPhotoUrl::upTo($media, 'preview', $watermark),
                'full_url' => PublicPhotoUrl::upTo($media, 'full', $watermark),
            ])->values()->all(),
            'address' => $address === null ? null : [
                'street' => $address->street,
                'neighborhood' => $address->neighborhood,
                'city' => $address->city,
                'region' => $address->region,
                'latitude' => $address->latitude !== null ? (float) $address->latitude : null,
                'longitude' => $address->longitude !== null ? (float) $address->longitude : null,
                'geo_city_id' => $address->geo_city_id,
                'geo_neighborhood_id' => $address->geo_neighborhood_id,
            ],
            'agency_id' => $property->agency_id,
            'submitted_at' => $this->iso($property->submitted_at),
            ...$checks->submitter($property),
            'checks' => $checks->checks($property),
        ];
    }
}
