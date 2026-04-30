<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FavoriteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'user_id' => $this->user_id,
            'notes' => $this->notes,
            'property' => $this->whenLoaded('property', fn () => PropertyResource::make($this->property)),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
