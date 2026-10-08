<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-594 (ADR-0039 §8) — la facture d'intervention. */
class ServiceProviderBillResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'maintenance_request_id' => $this->maintenance_request_id,
            'agency_id' => $this->agency_id,
            'property_id' => $this->property_id,
            'provider_id' => $this->provider_id,
            'reference_number' => $this->reference_number,
            'provider_reference' => $this->provider_reference,
            'amount' => (float) $this->amount,
            'currency' => $this->currency?->value ?? 'XOF',
            'exceeds_quote' => (bool) $this->exceeds_quote,
            'status' => $this->status?->value,
            'validated_by_id' => $this->validated_by_id,
            'validated_at' => $this->iso($this->validated_at),
            'rejection_reason' => $this->rejection_reason,
            'rechargeable_to_landlord' => (bool) $this->rechargeable_to_landlord,
            'imputed_payout_id' => $this->imputed_payout_id,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
