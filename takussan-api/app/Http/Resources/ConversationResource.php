<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class ConversationResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'subject' => $this->subject,
            'type' => $this->type?->value,
            'status' => $this->status?->value,
            'property_id' => $this->property_id,
            'lease_id' => $this->lease_id,
            'maintenance_request_id' => $this->maintenance_request_id,
            'created_by' => $this->created_by,
            'last_message_preview' => $this->last_message_preview,
            'last_message_at' => $this->iso($this->last_message_at),
            'created_at' => $this->iso($this->created_at),
            // Relation is `BelongsTo` so `whenLoaded` can yield null when the
            // FK is null and the relation has been eager-loaded — guard
            // against feeding `null` to `PropertyResource::make`.
            'property' => $this->whenLoaded(
                'property',
                fn () => $this->property ? PropertyResource::make($this->property) : null,
            ),
        ];
    }
}
