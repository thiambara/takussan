<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PayoutResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'lease_id' => $this->lease_id,
            'booking_id' => $this->booking_id,
            'agency_id' => $this->agency_id,
            'landlord_id' => $this->landlord_id,
            'issued_by_id' => $this->issued_by_id,
            'status' => $this->status?->value,
            'period_start' => $this->period_start?->toDateString(),
            'period_end' => $this->period_end?->toDateString(),
            'gross_amount' => (float) $this->gross_amount,
            'commission_amount' => (float) $this->commission_amount,
            'fees_amount' => $this->fees_amount !== null ? (float) $this->fees_amount : null,
            'net_amount' => (float) $this->net_amount,
            'currency' => $this->currency?->value,
            'payment_method' => $this->payment_method?->value,
            'transaction_id' => $this->transaction_id,
            'scheduled_at' => $this->scheduled_at?->toISOString(),
            'processed_at' => $this->processed_at?->toISOString(),
            'failed_reason' => $this->failed_reason,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
