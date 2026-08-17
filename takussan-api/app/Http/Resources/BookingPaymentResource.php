<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class BookingPaymentResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'booking_id' => $this->booking_id,
            'payer_id' => $this->payer_id,
            'collector_id' => $this->collector_id,
            'reference_number' => $this->reference_number,
            'receipt_number' => $this->receipt_number,
            'amount' => (float) $this->amount,
            'currency' => is_object($this->currency) ? $this->currency->value : $this->currency,
            'payment_method' => $this->payment_method?->value,
            'payment_type' => $this->payment_type?->value,
            'status' => is_object($this->status) ? $this->status->value : $this->status,
            'refund_amount' => $this->refund_amount !== null ? (float) $this->refund_amount : null,
            'refund_reason' => $this->refund_reason,
            'paid_amount' => (float) $this->paid_amount,
            'remaining_amount' => (float) $this->remaining_amount,
            'paid_at' => $this->paid_at?->toISOString(),
            'transaction_id' => $this->transaction_id,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
