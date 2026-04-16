<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class PropertyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'price' => $this->price,
            'type' => $this->type->value,
            'type_label' => $this->type->label(),
            'location' => [
                'quarter' => $this->location_quarter,
                'city' => $this->location_city,
            ],
            'bedrooms' => $this->bedrooms,
            'bathrooms' => $this->bathrooms,
            'area' => $this->area,
            'featured' => $this->featured,
            'main_photo_url' => $this->getFirstMediaUrl('photos', 'medium') ?: $this->main_photo_url,
            'description' => $this->when(
                $request->routeIs('public.properties.show'),
                $this->description
            ),
            'photos' => $this->when(
                $request->routeIs('public.properties.show'),
                fn () => $this->getMedia('photos')->map(fn (Media $media) => [
                    'thumbnail' => $media->getUrl('thumbnail'),
                    'medium' => $media->getUrl('medium'),
                    'large' => $media->getUrl('large'),
                ])->toArray()
            ),
            'created_at' => $this->created_at->toISOString(),
        ];
    }
}
