<?php

namespace App\Services\Accounting;

use App\Models\BankStatementLine;
use App\Models\BookingPayment;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Invoice;
use App\Models\LeasePayment;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Deterministic heuristic matcher for bank statement line reconciliation.
 *
 * Scores candidates by 4 rules (highest wins):
 *   95 — exact amount + exact reference
 *   80 — exact amount + counterparty similarity ≥ 0.85
 *   70 — exact amount + date within ±2 days
 *   60 — exact amount only (closest date, unless ambiguous)
 */
class ReconciliationMatcher
{
    private const PAYMENT_MODELS = [
        BookingPayment::class,
        LeasePayment::class,
        Invoice::class,
    ];

    /**
     * Suggest a matching payment for a given bank statement line.
     *
     * Only credit lines are matched — debit lines are ignored in V1.
     */
    public function suggestFor(BankStatementLine $line): ?MatchSuggestion
    {
        if ($line->direction === BankStatementLineDirection::Debit) {
            return null;
        }

        $statement = $line->statement;
        $agencyId = $statement->agency_id;
        $amount = (float) $line->amount;
        $currency = $line->currency;
        $postedAt = $line->posted_at;

        $windowStart = $postedAt->copy()->subDays(7);
        $windowEnd = $postedAt->copy()->addDays(7);

        $candidates = $this->fetchCandidates($agencyId, $amount, $currency, $windowStart, $windowEnd);

        if ($candidates->isEmpty()) {
            return null;
        }

        return $this->scoreCandidates($candidates, $line);
    }

    /**
     * Fetch all non-reconciled payments matching amount + currency + agency + date window.
     *
     * @return Collection<int, object{type: string, id: int, reference_number: ?string, paid_at: ?Carbon, payer_name: ?string}>
     */
    private function fetchCandidates(int $agencyId, float $amount, string $currency, $windowStart, $windowEnd): Collection
    {
        $candidates = collect();

        foreach (self::PAYMENT_MODELS as $modelClass) {
            $query = $modelClass::query()
                ->whereNull('bank_reconciled_at')
                ->where('currency', $currency);

            // Scope by agency — each model has a different FK path.
            $query = match ($modelClass) {
                BookingPayment::class => $query->whereHas('booking', fn ($q) => $q->whereHas('property', fn ($q2) => $q2->where('agency_id', $agencyId))),
                LeasePayment::class => $query->whereHas('lease', fn ($q) => $q->where('agency_id', $agencyId)),
                Invoice::class => $query->where('agency_id', $agencyId),
            };

            // Amount filter with small tolerance for rounding
            $query->whereRaw('ABS(amount - ?) < 0.01', [$amount]);

            // Date window
            $dateColumn = $modelClass === Invoice::class ? 'issue_date' : 'paid_at';
            $query->whereBetween($dateColumn, [$windowStart, $windowEnd]);

            $results = $query->get(['id', 'amount', 'currency', 'reference_number', $dateColumn]);

            foreach ($results as $row) {
                $candidates->push((object) [
                    'type' => $modelClass,
                    'id' => $row->id,
                    'reference_number' => $row->reference_number ?? null,
                    'paid_at' => $row->{$dateColumn},
                    'payer_name' => null, // Loaded lazily only when needed
                    'model' => $row,
                ]);
            }
        }

        return $candidates;
    }

    private function scoreCandidates(Collection $candidates, BankStatementLine $line): ?MatchSuggestion
    {
        $best = null;
        $bestScore = 0;

        foreach ($candidates as $candidate) {
            $score = $this->scoreCandidate($candidate, $line);

            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $candidate;
            }
        }

        // Score 60: check for ambiguity (multiple candidates at same score)
        if ($bestScore === 60) {
            $sameScoreCount = $candidates->filter(
                fn ($c) => $this->scoreCandidate($c, $line) === 60
            )->count();

            if ($sameScoreCount >= 2) {
                return null; // Ambiguous — don't suggest
            }
        }

        if ($best === null || $bestScore < 60) {
            return null;
        }

        return new MatchSuggestion(
            paymentType: $best->type,
            paymentId: $best->id,
            confidence: $bestScore,
        );
    }

    private function scoreCandidate(object $candidate, BankStatementLine $line): int
    {
        // Rule 1: exact amount + exact reference → 95
        if ($candidate->reference_number !== null && $line->reference !== null) {
            if (strtolower($candidate->reference_number) === strtolower($line->reference)) {
                return 95;
            }
        }

        // Rule 2: exact amount + counterparty similarity ≥ 0.85 → 80
        if ($line->counterparty !== null && $candidate->payer_name === null) {
            // Lazy-load payer name
            $candidate->payer_name = $this->resolvePayerName($candidate);
        }

        if ($line->counterparty !== null && $candidate->payer_name !== null) {
            $similarity = 0;
            similar_text(
                strtolower($line->counterparty),
                strtolower($candidate->payer_name),
                $similarity,
            );

            if ($similarity >= 85) {
                return 80;
            }
        }

        // Rule 3: exact amount + date ±2 days → 70
        if ($candidate->paid_at !== null && $line->posted_at !== null) {
            $daysDiff = abs($line->posted_at->diffInDays($candidate->paid_at));

            if ($daysDiff <= 2) {
                return 70;
            }
        }

        // Rule 4: exact amount only → 60
        return 60;
    }

    private function resolvePayerName(object $candidate): ?string
    {
        $model = $candidate->model;

        if ($model instanceof BookingPayment) {
            return $model->payer?->full_name;
        }

        if ($model instanceof LeasePayment) {
            return $model->payer?->full_name;
        }

        if ($model instanceof Invoice) {
            return $model->customer?->full_name;
        }

        return null;
    }
}
