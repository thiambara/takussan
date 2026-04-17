<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InvoiceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'invoiceable_id' => $this->invoiceable_id,
            'invoiceable_type' => $this->invoiceable_type,
            'customer_id' => $this->customer_id,
            'issued_by_id' => $this->issued_by_id,
            'agency_id' => $this->agency_id,
            'status' => $this->status?->value,
            'issue_date' => $this->issue_date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),
            'subtotal' => (float) $this->subtotal,
            'tax_rate' => $this->tax_rate !== null ? (float) $this->tax_rate : null,
            'tax_amount' => $this->tax_amount !== null ? (float) $this->tax_amount : null,
            'total_amount' => (float) $this->total_amount,
            'currency' => $this->currency?->value,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
