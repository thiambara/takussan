<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PropertyVisitResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'visitor_id' => $this->visitor_id,
            'customer_id' => $this->customer_id,
            'agent_id' => $this->agent_id,
            'visitor_name' => $this->visitor_name,
            'visitor_phone' => $this->visitor_phone,
            'visitor_email' => $this->visitor_email,
            'type' => $this->type?->value,
            'status' => $this->status?->value,
            'scheduled_at' => $this->scheduled_at?->toISOString(),
            'completed_at' => $this->completed_at?->toISOString(),
            'duration_minutes' => $this->duration_minutes,
            'feedback' => $this->feedback,
            'rating' => $this->rating !== null ? (float) $this->rating : null,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
