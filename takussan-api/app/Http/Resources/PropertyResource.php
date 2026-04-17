<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class PropertyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $address = $this->resource->relationLoaded('address') ? $this->resource->address : null;

        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'title' => $this->title,
            'slug' => $this->slug,
            'price' => (float) $this->price,
            'currency' => $this->currency?->value,
            'type' => $this->type?->value,
            'contract_type' => $this->contract_type?->value,
            'status' => $this->status?->value,
            'visibility' => $this->visibility?->value,
            'location' => [
                'quarter' => $address?->neighborhood,
                'city' => $address?->city,
                'region' => $address?->region,
                'country' => $address?->country,
                'latitude' => $address?->latitude,
                'longitude' => $address?->longitude,
            ],
            'bedrooms' => $this->bedrooms,
            'bathrooms' => $this->bathrooms,
            'area' => $this->area,
            'furnished' => (bool) $this->furnished,
            'featured' => (bool) $this->featured,
            'main_photo_url' => $this->getFirstMediaUrl('photos', 'preview') ?: null,
            'description' => $this->when(
                $request->routeIs('public.properties.show') || $request->routeIs('properties.show'),
                $this->description
            ),
            'photos' => $this->when(
                $request->routeIs('public.properties.show') || $request->routeIs('properties.show'),
                fn () => $this->getMedia('photos')->map(fn (Media $media) => [
                    'thumbnail' => $media->getUrl('thumbnail'),
                    'preview' => $media->getUrl('preview'),
                    'original' => $media->getUrl(),
                ])->toArray()
            ),
            'published_at' => $this->published_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
