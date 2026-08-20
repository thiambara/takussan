<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class InvoiceResource extends BaseResource
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
            'issue_date' => $this->calendarDate($this->issue_date),
            'due_date' => $this->calendarDate($this->due_date),
            'subtotal' => (float) $this->subtotal,
            'tax_rate' => $this->tax_rate !== null ? (float) $this->tax_rate : null,
            'tax_amount' => $this->tax_amount !== null ? (float) $this->tax_amount : null,
            'total_amount' => (float) $this->total_amount,
            'currency' => $this->currency?->value,
            'notes' => $this->notes,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
