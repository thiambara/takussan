<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LeaseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'property_id' => $this->property_id,
            'landlord_id' => $this->landlord_id,
            'tenant_id' => $this->tenant_id,
            'agency_id' => $this->agency_id,
            'booking_id' => $this->booking_id,
            'renewed_from_lease_id' => $this->renewed_from_lease_id,
            'type' => $this->type?->value,
            'status' => $this->status?->value,
            'start_date' => $this->start_date?->toDateString(),
            'end_date' => $this->end_date?->toDateString(),
            'renewal_date' => $this->renewal_date?->toDateString(),
            'monthly_rent' => $this->monthly_rent !== null ? (float) $this->monthly_rent : null,
            'sale_price' => $this->sale_price !== null ? (float) $this->sale_price : null,
            'currency' => $this->currency?->value,
            'deposit_amount' => $this->deposit_amount !== null ? (float) $this->deposit_amount : null,
            'deposit_refunded_amount' => $this->deposit_refunded_amount !== null ? (float) $this->deposit_refunded_amount : null,
            'deposit_refunded_at' => $this->deposit_refunded_at?->toISOString(),
            'deposit_refund_reason' => $this->deposit_refund_reason,
            'commission_rate' => $this->commission_rate !== null ? (float) $this->commission_rate : null,
            'payment_frequency' => $this->payment_frequency?->value,
            'payment_day' => $this->payment_day,
            'signed_at' => $this->signed_at?->toISOString(),
            'terminated_at' => $this->terminated_at?->toISOString(),
            'property' => $this->whenLoaded('property', fn () => PropertyResource::make($this->property)),
            'tenant' => $this->whenLoaded('tenant', fn () => CustomerResource::make($this->tenant)),
            'renewed_from' => $this->whenLoaded('renewedFrom', fn () => self::make($this->renewedFrom)),
            'renewals' => $this->whenLoaded('renewals', fn () => self::collection($this->renewals)),
            'renewals_count' => $this->whenCounted('renewals'),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
