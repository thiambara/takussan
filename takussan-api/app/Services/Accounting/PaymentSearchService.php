<?php

namespace App\Services\Accounting;

use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Invoice;
use App\Models\LeasePayment;
use Illuminate\Support\Collection;

class PaymentSearchService
{
    private const TYPE_MAP = [
        BookingPayment::class => 'booking_payment',
        LeasePayment::class => 'lease_payment',
        Invoice::class => 'invoice',
    ];

    /**
     * Search non-reconciled payments matching query + optional amount hint.
     *
     * @return Collection<int, MatchCandidate>
     */
    public function search(Agency $agency, string $query, ?float $amountHint, int $limit = 20): Collection
    {
        $candidates = collect();

        $candidates = $candidates->merge($this->searchBookingPayments($agency, $query, $amountHint));
        $candidates = $candidates->merge($this->searchLeasePayments($agency, $query, $amountHint));
        $candidates = $candidates->merge($this->searchInvoices($agency, $query, $amountHint));

        // Sort by relevance (amount match first, then date proximity)
        if ($amountHint !== null) {
            $candidates = $candidates->sortBy(fn (MatchCandidate $c) => abs((float) $c->amount - $amountHint));
        }

        return $candidates->take($limit)->values();
    }

    /** @return Collection<int, MatchCandidate> */
    private function searchBookingPayments(Agency $agency, string $query, ?float $amountHint): Collection
    {
        $base = BookingPayment::query()
            ->whereNull('bank_reconciled_at')
            ->whereHas('booking', fn ($q) => $q->whereHas('property', fn ($q2) => $q2->where('agency_id', $agency->id)));

        $this->applySearch($base, $query, $amountHint);

        return $base->with('payer')->limit(10)->get()->map(fn (BookingPayment $p) => new MatchCandidate(
            id: $p->id,
            type: 'booking_payment',
            label: "Booking #{$p->booking_id} — {$p->reference_number}",
            amount: (string) $p->amount,
            currency: $p->currency instanceof \BackedEnum ? $p->currency->value : (string) $p->currency,
            reference: $p->reference_number,
            paidAt: $p->paid_at?->toDateString(),
            payerName: $p->payer?->full_name,
        ));
    }

    /** @return Collection<int, MatchCandidate> */
    private function searchLeasePayments(Agency $agency, string $query, ?float $amountHint): Collection
    {
        $base = LeasePayment::query()
            ->whereNull('bank_reconciled_at')
            ->whereHas('lease', fn ($q) => $q->where('agency_id', $agency->id));

        $this->applySearch($base, $query, $amountHint);

        return $base->with('payer')->limit(10)->get()->map(fn (LeasePayment $p) => new MatchCandidate(
            id: $p->id,
            type: 'lease_payment',
            label: "Lease #{$p->lease_id} — {$p->reference_number}",
            amount: (string) $p->amount,
            currency: $p->currency instanceof \BackedEnum ? $p->currency->value : (string) $p->currency,
            reference: $p->reference_number,
            paidAt: $p->paid_at?->toDateString(),
            payerName: $p->payer?->full_name,
        ));
    }

    /** @return Collection<int, MatchCandidate> */
    private function searchInvoices(Agency $agency, string $query, ?float $amountHint): Collection
    {
        $base = Invoice::query()
            ->whereNull('bank_reconciled_at')
            ->where('agency_id', $agency->id);

        if ($query !== '') {
            $base->where(function ($q) use ($query) {
                $q->where('reference_number', 'like', "%{$query}%")
                    ->orWhere('notes', 'like', "%{$query}%");
            });
        }

        if ($amountHint !== null) {
            $base->whereRaw('ABS(total_amount - ?) < 1', [$amountHint]);
        }

        return $base->with('customer')->limit(10)->get()->map(fn (Invoice $p) => new MatchCandidate(
            id: $p->id,
            type: 'invoice',
            label: "Invoice {$p->reference_number}",
            amount: (string) $p->total_amount,
            currency: $p->currency instanceof \BackedEnum ? $p->currency->value : (string) $p->currency,
            reference: $p->reference_number,
            paidAt: $p->issue_date?->toDateString(),
            payerName: $p->customer?->full_name,
        ));
    }

    private function applySearch($query, string $search, ?float $amountHint): void
    {
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('reference_number', 'like', "%{$search}%")
                    ->orWhere('notes', 'like', "%{$search}%");
            });
        }

        if ($amountHint !== null) {
            $query->whereRaw('ABS(amount - ?) < 1', [$amountHint]);
        }
    }
}
