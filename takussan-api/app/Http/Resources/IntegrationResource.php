<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class IntegrationResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'provider' => $this->provider,
            'agency_id' => $this->agency_id,
            'is_active' => $this->is_active,
            'last_used_at' => $this->iso($this->last_used_at),
            'last_health_check_at' => $this->iso($this->last_health_check_at),
            'health_status' => $this->health_status,
            'metadata' => $this->metadata,
            'created_at' => $this->iso($this->created_at),
            'updated_at' => $this->iso($this->updated_at),
        ];
    }
}
