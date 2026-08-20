<?php

namespace App\Http\Resources\Accounting;

use App\Http\Resources\Bases\BaseResource;
use App\Models\BookingPayment;
use App\Models\Invoice;
use App\Models\LeasePayment;
use Illuminate\Http\Request;

class BankStatementLineResource extends BaseResource
{
    private const PAYMENT_TYPE_MAP = [
        BookingPayment::class => 'booking_payment',
        LeasePayment::class => 'lease_payment',
        Invoice::class => 'invoice',
    ];

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'bank_statement_id' => $this->bank_statement_id,
            'posted_at' => $this->calendarDate($this->posted_at),
            'amount' => $this->amount,
            'direction' => $this->direction?->value,
            'currency' => $this->currency,
            'label' => $this->label,
            'reference' => $this->reference,
            'counterparty' => $this->counterparty,
            'match_status' => $this->match_status?->value,
            'match_status_label' => $this->match_status ? __("reconciliation.line_status.{$this->match_status->value}") : null,
            'matched_payment_type' => $this->matched_payment_type
                ? (self::PAYMENT_TYPE_MAP[$this->matched_payment_type] ?? $this->matched_payment_type)
                : null,
            'matched_payment_id' => $this->matched_payment_id,
            'match_confidence' => $this->match_confidence,
            'confirmed_at' => $this->iso($this->confirmed_at),
            'confirmed_by' => $this->confirmed_by,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
