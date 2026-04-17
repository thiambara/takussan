<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MaintenanceRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'lease_id' => $this->lease_id,
            'requester_id' => $this->requester_id,
            'assigned_to' => $this->assigned_to,
            'title' => $this->title,
            'description' => $this->description,
            'category' => $this->category?->value,
            'priority' => $this->priority?->value,
            'status' => $this->status?->value,
            'estimated_cost' => $this->estimated_cost !== null ? (float) $this->estimated_cost : null,
            'actual_cost' => $this->actual_cost !== null ? (float) $this->actual_cost : null,
            'scheduled_at' => $this->scheduled_at?->toISOString(),
            'started_at' => $this->started_at?->toISOString(),
            'completed_at' => $this->completed_at?->toISOString(),
            'resolution_notes' => $this->resolution_notes,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
