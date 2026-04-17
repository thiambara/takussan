<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LeasePaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'lease_id' => $this->lease_id,
            'payer_id' => $this->payer_id,
            'collector_id' => $this->collector_id,
            'amount' => (float) $this->amount,
            'currency' => $this->currency?->value,
            'payment_method' => $this->payment_method?->value,
            'payment_type' => $this->payment_type?->value,
            'period_start' => $this->period_start?->toDateString(),
            'period_end' => $this->period_end?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),
            'paid_at' => $this->paid_at?->toISOString(),
            'status' => $this->status?->value,
            'late_fee' => $this->late_fee !== null ? (float) $this->late_fee : null,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
