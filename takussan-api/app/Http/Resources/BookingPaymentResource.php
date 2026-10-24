<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Payout\PayoutClawbacks;
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
            'paid_at' => $this->iso($this->paid_at),
            'transaction_id' => $this->transaction_id,
            'notes' => $this->notes,
            'created_at' => $this->iso($this->created_at),
            'paid_out' => $this->paidOut($request),
        ];
    }

    /**
     * TCK-2153 (P205.02 ; ADR-0039, amendement du 2026-10-24, point 5) — le reversement au bailleur
     * `completed` qui a porté cet acompte : son remboursement créera une reprise (TCK-2151). Rendu
     * à qui peut lire ce reversement (`PayoutPolicy::view`), `null` sinon.
     *
     * @return array{payout_id: int, reference_number: string, processed_at: ?string}|null
     */
    private function paidOut(Request $request): ?array
    {
        $payout = app(PayoutClawbacks::class)->paidOutPayout((int) $this->id);
        if ($payout === null || $request->user()?->can('view', $payout) !== true) {
            return null;
        }

        return [
            'payout_id' => (int) $payout->id,
            'reference_number' => $payout->reference_number,
            'processed_at' => $this->iso($payout->processed_at),
        ];
    }
}
