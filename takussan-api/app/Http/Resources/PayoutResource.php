<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class PayoutResource extends BaseResource
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
            // TCK-594 (ADR-0039 §2) — le bénéficiaire explicite : un remboursement de caution est `tenant`.
            'payee_role' => $this->payee_role?->value,
            'service_provider_bill_id' => $this->service_provider_bill_id,
            'issued_by_id' => $this->issued_by_id,
            'approved_by_id' => $this->approved_by_id,
            'approved_at' => $this->iso($this->approved_at),
            'processed_by_id' => $this->processed_by_id,
            'issuer' => $this->whenLoaded('issuer', fn () => $this->issuer ? [
                'id' => $this->issuer->id,
                'name' => trim($this->issuer->first_name.' '.$this->issuer->last_name) ?: $this->issuer->username,
            ] : null),
            'status' => $this->status?->value,
            'period_start' => $this->calendarDate($this->period_start),
            'period_end' => $this->calendarDate($this->period_end),
            'gross_amount' => (float) $this->gross_amount,
            'commission_amount' => (float) $this->commission_amount,
            'fees_amount' => $this->fees_amount !== null ? (float) $this->fees_amount : null,
            'net_amount' => (float) $this->net_amount,
            'currency' => $this->currency?->value,
            'payment_method' => $this->payment_method?->value,
            'payout_method_id' => $this->payout_method_id,
            // La destination n'est rendue que MASQUÉE (ADR-0039 §6).
            'destination_masked' => $this->metadata['destination_masked'] ?? null,
            'transaction_id' => $this->transaction_id,
            'scheduled_at' => $this->iso($this->scheduled_at),
            'processed_at' => $this->iso($this->processed_at),
            // TCK-593 — rapproché sur un débit du relevé bancaire.
            'bank_reconciled_at' => $this->iso($this->bank_reconciled_at),
            'failed_reason' => $this->failed_reason,
            'notes' => $this->notes,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
