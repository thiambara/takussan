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
            // TCK-594 (ADR-0039 §7) — facture ou avoir, la facture annulée, et les avoirs reçus
            // (le front affiche l'avoir sur l'originale).
            'kind' => $this->kind?->value ?? 'invoice',
            'credited_invoice_id' => $this->credited_invoice_id,
            'credit_notes' => $this->whenLoaded('creditNotes', fn () => $this->creditNotes->map(fn ($note) => [
                'id' => $note->id,
                'reference_number' => $note->reference_number,
                'total_amount' => (float) $note->total_amount,
                'issue_date' => $this->calendarDate($note->issue_date),
            ])->values()->all()),
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
