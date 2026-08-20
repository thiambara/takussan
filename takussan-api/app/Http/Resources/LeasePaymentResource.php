<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class LeasePaymentResource extends BaseResource
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
            'period_start' => $this->calendarDate($this->period_start),
            'period_end' => $this->calendarDate($this->period_end),
            'due_date' => $this->calendarDate($this->due_date),
            'paid_at' => $this->iso($this->paid_at),
            'status' => $this->status?->value,
            'paid_amount' => (float) $this->paid_amount,
            'remaining_amount' => (float) $this->remaining_amount,
            'late_fee_amount' => $this->late_fee_amount !== null ? (float) $this->late_fee_amount : null,
            'late_fee_applied_at' => $this->iso($this->late_fee_applied_at),
            'notes' => $this->notes,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
