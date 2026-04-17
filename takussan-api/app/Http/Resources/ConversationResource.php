<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ConversationResource extends JsonResource
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
            'last_message_at' => $this->last_message_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
