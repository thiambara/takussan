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
            'cancelled_at' => $this->cancelled_at?->toISOString(),
            'cancellation_reason' => $this->cancellation_reason,
            'duration_minutes' => $this->duration_minutes,
            'feedback' => $this->feedback,
            'rating' => $this->rating !== null ? (float) $this->rating : null,
            'notes' => $this->notes,
            'metadata' => $this->metadata,
            'property' => $this->whenLoaded('property', fn () => [
                'id' => $this->property->id,
                'title' => $this->property->title,
                'slug' => $this->property->slug,
            ]),
            'visitor' => $this->whenLoaded('visitor', fn () => $this->visitor ? [
                'id' => $this->visitor->id,
                'first_name' => $this->visitor->first_name,
                'last_name' => $this->visitor->last_name,
                'email' => $this->visitor->email,
            ] : null),
            'agent' => $this->whenLoaded('agent', fn () => $this->agent ? [
                'id' => $this->agent->id,
                'first_name' => $this->agent->first_name,
                'last_name' => $this->agent->last_name,
            ] : null),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
