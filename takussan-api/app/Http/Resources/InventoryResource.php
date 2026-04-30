<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InventoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'lease_id' => $this->lease_id,
            'property_id' => $this->property_id,
            'type' => $this->type?->value,
            'conducted_by' => $this->conducted_by,
            'tenant_id' => $this->tenant_id,
            'conducted_at' => $this->conducted_at?->toISOString(),
            'status' => $this->status?->value,
            'general_condition' => $this->general_condition?->value,
            'rooms' => $this->rooms,
            'notes' => $this->notes,
            'tenant_signed' => (bool) $this->tenant_signed,
            'tenant_signed_at' => $this->tenant_signed_at?->toISOString(),
            'tenant_signature_hash' => $this->tenant_signature_hash,
            'owner_signed' => (bool) $this->owner_signed,
            'owner_signed_at' => $this->owner_signed_at?->toISOString(),
            'owner_signature_hash' => $this->owner_signature_hash,
            'signed_at' => $this->signed_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
