<?php

namespace App\Services\Accounting;

use App\Models\BankStatementLine;
use App\Models\BookingPayment;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementSourceFormat;
use App\Models\Enums\PayoutStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\PlatformPayout;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Deterministic heuristic matcher for bank statement line reconciliation.
 *
 * Scores candidates by 4 rules (highest wins; two candidates tied at the best score → no suggestion):
 *   95 — exact amount + exact reference
 *   80 — exact amount + counterparty similarity ≥ 0.85
 *   70 — exact amount + date within ±2 days
 *   60 — exact amount only
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
     * TCK-593 — un crédit s'apparie à un encaissement (BookingPayment, LeasePayment, Invoice), un
     * débit à un reversement (`Payout` `completed`). Les deux sens ne se croisent jamais.
     */
    public function suggestFor(BankStatementLine $line): ?MatchSuggestion
    {
        $statement = $line->statement;
        $agencyId = $statement->agency_id;
        $amount = (float) $line->amount;
        $currency = $line->currency;
        $postedAt = $line->posted_at;

        $windowStart = $postedAt->copy()->subDays(7);
        $windowEnd = $postedAt->copy()->addDays(7);

        $candidates = $line->direction === BankStatementLineDirection::Debit
            ? $this->fetchPayoutCandidates($agencyId, $amount, $currency, $windowStart, $windowEnd)
            : $this->fetchCandidates($agencyId, $amount, $currency, $windowStart, $windowEnd)
                ->merge($this->fetchPlatformPayoutCandidates($agencyId, $amount, $currency, $windowStart, $windowEnd));

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
            // TCK-1417 (P141.04) — agence, rapprochement, et ce qu'aucun crédit ne paie (caution
            // rendue TCK-594, facture non encaissable TCK-724, encaissement de la plateforme
            // TCK-1415) : un seul scope, partagé avec la recherche manuelle.
            $query = $modelClass::query()
                ->awaitingBankCredit($agencyId)
                ->where('currency', $currency);

            // Amount filter with small tolerance for rounding. Invoices store the
            // total in `total_amount`; booking/lease payments use `amount`.
            $amountColumn = $modelClass === Invoice::class ? 'total_amount' : 'amount';

            // TCK-593 — une échéance payée en ligne arrive sur le compte pour le montant FIGÉ à
            // l'initiation, pénalité comprise quand l'agence l'encaisse en ligne : 157 500, pas
            // 150 000. TCK-715 — l'expression vit sur le modèle, partagée avec la recherche
            // manuelle, et ne lit le montant figé que d'une échéance soldée en ligne.
            if ($modelClass === LeasePayment::class) {
                $query->whereExpectedAmountNear($amount, 0.01);
            } else {
                $query->whereRaw("ABS({$amountColumn} - ?) < 0.01", [$amount]);
            }

            // Date window
            $dateColumn = $modelClass === Invoice::class ? 'issue_date' : 'paid_at';
            $query->whereBetween($dateColumn, [$windowStart, $windowEnd]);

            // TCK-706 (P25.03) — la clé du payeur, et sa relation chargée d'avance : sans elle,
            // `resolvePayerName()` lisait une relation `null` et la règle 80 ne s'appliquait jamais.
            [$payerKey, $payerRelation] = $modelClass === Invoice::class
                ? ['customer_id', 'customer']
                : ['payer_id', 'payer'];

            $results = $query
                ->with("{$payerRelation}:id,first_name,last_name")
                ->get(['id', $amountColumn, 'currency', 'reference_number', $dateColumn, $payerKey]);

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

    /**
     * TCK-593 — un débit du relevé est un reversement émis : `Payout` `completed` de l'agence, au
     * `net_amount` exact (ce qui quitte le compte), dans la fenêtre autour de `processed_at`.
     *
     * @return Collection<int, object{type: string, id: int, reference_number: ?string, paid_at: ?Carbon, payer_name: ?string}>
     */
    private function fetchPayoutCandidates(int $agencyId, float $amount, string $currency, $windowStart, $windowEnd): Collection
    {
        return Payout::query()
            ->whereNull('bank_reconciled_at')
            ->where('status', PayoutStatus::Completed)
            ->where('agency_id', $agencyId)
            ->where('currency', $currency)
            ->whereRaw('ABS(net_amount - ?) < 0.01', [$amount])
            ->whereBetween('processed_at', [$windowStart, $windowEnd])
            ->get(['id', 'net_amount', 'currency', 'reference_number', 'processed_at', 'landlord_id'])
            ->map(fn (Payout $row) => (object) [
                'type' => Payout::class,
                'id' => $row->id,
                'reference_number' => $row->reference_number,
                'paid_at' => $row->processed_at,
                'payer_name' => null,
                'model' => $row,
            ]);
    }

    /**
     * TCK-1421 (P141.02) — un crédit du relevé peut être le virement de clôture de la plateforme :
     * `PlatformPayout` `paid` de l'agence, au `net_amount` exact, dans la fenêtre autour de
     * `processed_at`, sa `payment_reference` portant la règle de référence.
     *
     * @return Collection<int, object{type: string, id: int, reference_number: ?string, paid_at: ?Carbon, payer_name: ?string}>
     */
    private function fetchPlatformPayoutCandidates(int $agencyId, float $amount, string $currency, $windowStart, $windowEnd): Collection
    {
        return PlatformPayout::query()
            ->whereNull('bank_reconciled_at')
            ->where('status', PlatformPayoutStatus::Paid)
            ->where('agency_id', $agencyId)
            ->where('currency', $currency)
            ->whereRaw('ABS(net_amount - ?) < 0.01', [$amount])
            ->whereBetween('processed_at', [$windowStart, $windowEnd])
            ->get(['id', 'net_amount', 'currency', 'payment_reference', 'processed_at'])
            ->map(fn (PlatformPayout $row) => (object) [
                'type' => PlatformPayout::class,
                'id' => $row->id,
                'reference_number' => $row->payment_reference,
                'paid_at' => $row->processed_at,
                'payer_name' => null,
                'model' => $row,
            ]);
    }

    private function scoreCandidates(Collection $candidates, BankStatementLine $line): ?MatchSuggestion
    {
        $best = null;
        $bestScore = 0;
        $tied = 0;

        foreach ($candidates as $candidate) {
            $score = $this->scoreCandidate($candidate, $line);

            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $candidate;
                $tied = 1;
            } elseif ($score === $bestScore) {
                $tied++;
            }
        }

        // TCK-827 (P25.05) — deux candidats au meilleur score, à quelque palier que ce soit : la
        // ligne est ambiguë, rien n'est suggéré. Le premier rencontré n'est pas un critère.
        if ($tied >= 2) {
            return null;
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

        if ($candidate->reference_number !== null && $this->textCitesReference($line, $candidate->reference_number)) {
            return 95;
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

    /**
     * TCK-1721 (P157.07) — la règle 95 lit aussi le texte saisi par le payeur : le `MEMO` d'une ligne
     * OFX (le pilote met `FITID` en `reference` et `NAME` en libellé, et le `MEMO` ne vivait plus
     * que dans `raw_payload`), et le libellé d'une ligne CSV. La référence du paiement doit y
     * figurer comme un mot entier, casse ignorée : `LP-7` ne s'apparie pas à `LP-77`.
     */
    private function textCitesReference(BankStatementLine $line, string $reference): bool
    {
        $text = match ($line->statement?->source_format) {
            BankStatementSourceFormat::Ofx => $line->raw_payload['MEMO'] ?? null,
            BankStatementSourceFormat::Csv => $line->label,
            default => null,
        };

        if (! is_string($text) || trim($reference) === '') {
            return false;
        }

        return preg_match('/(?<![\\p{L}\\p{N}])'.preg_quote(trim($reference), '/').'(?![\\p{L}\\p{N}])/iu', $text) === 1;
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

        // Le bénéficiaire du virement sortant : le bailleur.
        if ($model instanceof Payout) {
            return $model->landlord?->full_name;
        }

        return null;
    }
}
