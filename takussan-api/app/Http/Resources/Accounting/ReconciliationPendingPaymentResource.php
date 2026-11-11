<?php

namespace App\Http\Resources\Accounting;

use App\Http\Resources\Bases\BaseResource;
use App\Models\BankStatementLine;
use App\Models\BookingPayment;
use App\Models\LeasePayment;
use App\Services\Accounting\ReconciliationOverviewService;
use Illuminate\Http\Request;

/**
 * TCK-2674 — un paiement à rapprocher (échéance de bail ou acompte de réservation) et la ligne de
 * relevé que le matcher lui propose (`suggested_line`, `null` sans proposition acceptable). La
 * ligne est passée par le contrôleur ({@see self::withSuggestion()}), choisie une fois pour la page.
 *
 * @property LeasePayment|BookingPayment $resource
 */
class ReconciliationPendingPaymentResource extends BaseResource
{
    private ?BankStatementLine $suggestion = null;

    public function withSuggestion(?BankStatementLine $line): static
    {
        $this->suggestion = $line;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $payment = $this->resource;
        $property = $payment instanceof LeasePayment ? $payment->lease?->property : $payment->booking?->property;
        $payer = $payment->payer;
        $line = $this->suggestion;

        return [
            'type' => array_search($payment::class, ReconciliationOverviewService::PAYMENT_TYPES, true),
            'id' => $payment->id,
            'reference' => $payment->reference_number,
            'payer' => $payer === null ? null : ['id' => $payer->id, 'name' => $payer->full_name],
            'property' => $property === null ? null : ['id' => $property->id, 'title' => $property->title],
            'amount' => $payment->amount,
            'currency' => $payment->currency instanceof \BackedEnum ? $payment->currency->value : $payment->currency,
            'paid_at' => $this->iso($payment->paid_at),
            'payment_method' => $payment->payment_method instanceof \BackedEnum ? $payment->payment_method->value : $payment->payment_method,
            'suggested_line' => $line === null ? null : [
                'id' => $line->id,
                'statement_id' => $line->bank_statement_id,
                'date' => $this->calendarDate($line->posted_at),
                'label' => $line->label,
                'amount' => $line->amount,
                'confidence' => $line->match_confidence,
            ],
        ];
    }
}
