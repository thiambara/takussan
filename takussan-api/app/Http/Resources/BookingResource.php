<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BookingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'property_id' => $this->property_id,
            'customer_id' => $this->customer_id,
            'agency_id' => $this->agency_id,
            'status' => $this->status?->value,
            'total_amount' => (float) $this->total_amount,
            'deposit_amount' => $this->deposit_amount !== null ? (float) $this->deposit_amount : null,
            'currency' => $this->currency?->value,
            'start_date' => $this->start_date?->toDateString(),
            'end_date' => $this->end_date?->toDateString(),
            'confirmed_at' => $this->confirmed_at?->toISOString(),
            'cancelled_at' => $this->cancelled_at?->toISOString(),
            'expires_at' => $this->expires_at?->toISOString(),
            'cancellation_by' => $this->cancellation_by?->value,
            'cancellation_reason' => $this->cancellation_reason,
            'notes' => $this->notes,
            'property' => $this->whenLoaded('property', fn () => PropertyResource::make($this->property)),
            'customer' => $this->whenLoaded('customer', fn () => CustomerResource::make($this->customer)),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
