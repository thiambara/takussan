<?php

namespace App\Services\Accounting;

use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\PayoutStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\PlatformPayout;
use Illuminate\Support\Collection;

class PaymentSearchService
{
    private const TYPE_MAP = [
        BookingPayment::class => 'booking_payment',
        LeasePayment::class => 'lease_payment',
        Invoice::class => 'invoice',
        Payout::class => 'payout',
        PlatformPayout::class => 'platform_payout',
    ];

    /**
     * Search non-reconciled payments matching query + optional amount hint.
     *
     * TCK-593 — `direction` est celle de la ligne à rapprocher : un débit ne cherche que les
     * reversements, un crédit que les encaissements. Sans direction, les deux.
     *
     * P157.01 (TCK-1917) — `currency` est la devise de la ligne : seuls les paiements de cette
     * devise sont proposés, ceux que `ReconciliationManager::confirmMatch()` accepte. La recherche
     * proposait une échéance en XOF à une ligne en EUR, et la confirmation rendait 422.
     *
     * @return Collection<int, MatchCandidate>
     */
    public function search(Agency $agency, string $query, ?float $amountHint, int $limit = 20, ?BankStatementLineDirection $direction = null, ?string $currency = null): Collection
    {
        $candidates = collect();

        if ($direction !== BankStatementLineDirection::Debit) {
            $candidates = $candidates->merge($this->searchBookingPayments($agency, $query, $amountHint, $currency));
            $candidates = $candidates->merge($this->searchLeasePayments($agency, $query, $amountHint, $currency));
            $candidates = $candidates->merge($this->searchInvoices($agency, $query, $amountHint, $currency));
            // TCK-1421 (P141.02) — le virement de clôture de la plateforme est un crédit.
            $candidates = $candidates->merge($this->searchPlatformPayouts($agency, $query, $amountHint, $currency));
        }

        if ($direction !== BankStatementLineDirection::Credit) {
            $candidates = $candidates->merge($this->searchPayouts($agency, $query, $amountHint, $currency));
        }

        // Sort by relevance (amount match first, then date proximity)
        if ($amountHint !== null) {
            $candidates = $candidates->sortBy(fn (MatchCandidate $c) => abs((float) $c->amount - $amountHint));
        }

        return $candidates->take($limit)->values();
    }

    /** @return Collection<int, MatchCandidate> */
    private function searchBookingPayments(Agency $agency, string $query, ?float $amountHint, ?string $currency): Collection
    {
        $base = BookingPayment::query()
            // TCK-1417 (P141.04) — le scope du matcher.
            ->awaitingBankCredit($agency->id);

        $this->applySearch($base, $query, $amountHint);

        $this->applyCurrency($base, $currency);

        return $base->with('payer')->limit(10)->get()->map(fn (BookingPayment $p) => new MatchCandidate(
            id: $p->id,
            type: 'booking_payment',
            label: "Booking #{$p->booking_id} — {$p->reference_number}",
            amount: (string) $p->amount,
            currency: $p->currency instanceof \BackedEnum ? $p->currency->value : (string) $p->currency,
            reference: $p->reference_number,
            paidAt: $p->paid_at?->toDateString(),
            payerName: $p->payer?->full_name,
            status: $p->status?->value,
        ));
    }

    /** @return Collection<int, MatchCandidate> */
    private function searchLeasePayments(Agency $agency, string $query, ?float $amountHint, ?string $currency): Collection
    {
        // TCK-1417 (P141.04) — le scope du matcher : sans les cautions rendues (TCK-594) ni les
        // loyers encaissés par la plateforme (TCK-1415).
        $base = LeasePayment::query()->awaitingBankCredit($agency->id);

        // TCK-715 (P25.01) — le montant attendu sur le compte, celui que compare le matcher : une
        // échéance payée en ligne pénalité comprise arrive pour 157 500, pas pour `amount`.
        $this->applySearch($base, $query, null);
        if ($amountHint !== null) {
            $base->whereExpectedAmountNear($amountHint, 1);
        }

        $this->applyCurrency($base, $currency);

        return $base->with('payer')->limit(10)->get()->map(fn (LeasePayment $p) => new MatchCandidate(
            id: $p->id,
            type: 'lease_payment',
            label: "Lease #{$p->lease_id} — {$p->reference_number}",
            amount: (string) $p->amount,
            currency: $p->currency instanceof \BackedEnum ? $p->currency->value : (string) $p->currency,
            reference: $p->reference_number,
            paidAt: $p->paid_at?->toDateString(),
            payerName: $p->payer?->full_name,
            status: $p->status?->value,
        ));
    }

    /** @return Collection<int, MatchCandidate> */
    private function searchInvoices(Agency $agency, string $query, ?float $amountHint, ?string $currency): Collection
    {
        // TCK-1417 (P141.04) — le scope du matcher : les seules factures encaissables (TCK-724).
        $base = Invoice::query()->awaitingBankCredit($agency->id);

        if ($query !== '') {
            $base->where(function ($q) use ($query) {
                $q->where('reference_number', 'like', "%{$query}%")
                    ->orWhere('notes', 'like', "%{$query}%");
            });
        }

        if ($amountHint !== null) {
            $base->whereRaw('ABS(total_amount - ?) < 1', [$amountHint]);
        }

        $this->applyCurrency($base, $currency);

        return $base->with('customer')->limit(10)->get()->map(fn (Invoice $p) => new MatchCandidate(
            id: $p->id,
            type: 'invoice',
            label: "Invoice {$p->reference_number}",
            amount: (string) $p->total_amount,
            currency: $p->currency instanceof \BackedEnum ? $p->currency->value : (string) $p->currency,
            reference: $p->reference_number,
            paidAt: $p->issue_date?->toDateString(),
            payerName: $p->customer?->full_name,
            status: $p->status?->value,
        ));
    }

    /** @return Collection<int, MatchCandidate> */
    private function searchPayouts(Agency $agency, string $query, ?float $amountHint, ?string $currency): Collection
    {
        $base = Payout::query()
            ->whereNull('bank_reconciled_at')
            ->where('status', PayoutStatus::Completed)
            ->where('agency_id', $agency->id);

        if ($query !== '') {
            $base->where(function ($q) use ($query) {
                $q->where('reference_number', 'like', "%{$query}%")
                    ->orWhere('notes', 'like', "%{$query}%");
            });
        }

        if ($amountHint !== null) {
            $base->whereRaw('ABS(net_amount - ?) < 1', [$amountHint]);
        }

        $this->applyCurrency($base, $currency);

        return $base->with('landlord')->limit(10)->get()->map(fn (Payout $p) => new MatchCandidate(
            id: $p->id,
            type: 'payout',
            label: "Payout {$p->reference_number}",
            amount: (string) $p->net_amount,
            currency: $p->currency instanceof \BackedEnum ? $p->currency->value : (string) $p->currency,
            reference: $p->reference_number,
            paidAt: $p->processed_at?->toDateString(),
            payerName: $p->landlord?->full_name,
            status: $p->status?->value,
        ));
    }

    /** @return Collection<int, MatchCandidate> */
    private function searchPlatformPayouts(Agency $agency, string $query, ?float $amountHint, ?string $currency): Collection
    {
        $base = PlatformPayout::query()
            ->whereNull('bank_reconciled_at')
            ->where('status', PlatformPayoutStatus::Paid)
            ->where('agency_id', $agency->id);

        if ($query !== '') {
            $base->where('payment_reference', 'like', "%{$query}%");
        }

        if ($amountHint !== null) {
            $base->whereRaw('ABS(net_amount - ?) < 1', [$amountHint]);
        }

        $this->applyCurrency($base, $currency);

        return $base->limit(10)->get()->map(fn (PlatformPayout $p) => new MatchCandidate(
            id: $p->id,
            type: 'platform_payout',
            label: "Platform payout {$p->payment_reference}",
            amount: (string) $p->net_amount,
            currency: (string) $p->currency,
            reference: $p->payment_reference,
            paidAt: $p->processed_at?->toDateString(),
            payerName: null,
            status: $p->status?->value,
        ));
    }

    /** P157.01 (TCK-1917) — en SQL, avant la limite de chaque type : la devise de la ligne. */
    private function applyCurrency($query, ?string $currency): void
    {
        if ($currency !== null) {
            $query->where($query->getModel()->qualifyColumn('currency'), strtoupper($currency));
        }
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
