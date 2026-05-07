<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class IntegrationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'provider' => $this->provider,
            'agency_id' => $this->agency_id,
            'is_active' => $this->is_active,
            'last_used_at' => $this->last_used_at,
            'last_health_check_at' => $this->last_health_check_at,
            'health_status' => $this->health_status,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
