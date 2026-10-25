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
                // P235.02 (TCK-2369) — nom, puis `username`, puis « — » : jamais `''` ni `null` pour un compte sans nom.
                'name' => $this->issuer->nameWithoutContact(),
            ] : null),
            'status' => $this->status?->value,
            'period_start' => $this->calendarDate($this->period_start),
            'period_end' => $this->calendarDate($this->period_end),
            // TCK-1182 (P100.03) — `whenHas` : sous un sparse fieldset qui ne lit pas la colonne, la clé
            // est omise au lieu d'une valeur inventée (montant à 0, nature ou devise par défaut).
            'gross_amount' => $this->whenHas('gross_amount', fn () => (float) $this->gross_amount),
            'commission_amount' => $this->whenHas('commission_amount', fn () => (float) $this->commission_amount),
            'fees_amount' => $this->fees_amount !== null ? (float) $this->fees_amount : null,
            'net_amount' => $this->whenHas('net_amount', fn () => (float) $this->net_amount),
            'currency' => $this->currency?->value,
            'payment_method' => $this->payment_method?->value,
            'payout_method_id' => $this->payout_method_id,
            // La destination n'est rendue que MASQUÉE (ADR-0039 §6) : celle du paiement, celle que
            // l'approbateur a approuvée, et — avant l'approbation — celle qu'il approuverait
            // (VERIF-594 M-4 : l'approbateur la voit).
            'destination_masked' => $this->metadata['destination_masked'] ?? null,
            'approved_destination_masked' => $this->metadata['approved_destination_masked'] ?? null,
            'payout_method_masked' => $this->relationLoaded('payoutMethod') ? $this->payoutMethod?->masked_identifier : null,
            'transaction_id' => $this->transaction_id,
            'scheduled_at' => $this->iso($this->scheduled_at),
            'processed_at' => $this->iso($this->processed_at),
            // TCK-593 — rapproché sur un débit du relevé bancaire.
            'bank_reconciled_at' => $this->iso($this->bank_reconciled_at),
            // TCK-2052 (ADR-0039, amendement du 2026-10-23, n° 13) — non nuls pour un `Payout`
            // « constaté » : le remboursement déjà sorti de ce payable, pas un reversement à approuver.
            'refunded_payment_type' => $this->resource->refundedPaymentTypeKey(),
            'refunded_payment_id' => $this->refunded_payment_id,
            'failed_reason' => $this->failed_reason,
            'notes' => $this->notes,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
