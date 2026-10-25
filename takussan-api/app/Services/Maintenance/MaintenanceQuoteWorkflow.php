<?php

namespace App\Services\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Enums\Currency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Services\Model\MaintenanceRequestService;
use Closure;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * TCK-592 — chaque geste du devis émet {@see MaintenanceStatusChanged} : les notifications (en clés
 * `lang/{fr,en,wo}/maintenance.php`, dans la langue du destinataire) et le fil de l'intervention
 * l'écoutent. Les contrôleurs n'écrivent plus aucune notification.
 */
class MaintenanceQuoteWorkflow
{
    public function __construct(
        private readonly MaintenanceStateMachine $machine,
        private readonly MaintenanceRequestService $requests,
        private readonly OwnerApprovalThreshold $threshold,
    ) {}

    /**
     * TCK-592 — cette classe portait sa propre table de transitions, sans acteur et sans
     * l'annulation. Elle lit désormais la table unique.
     */
    public function canTransitionTo(MaintenanceStatus $from, MaintenanceStatus $to): bool
    {
        return $this->machine->canTransition($from, $to);
    }

    private function assertTransition(MaintenanceRequest $mr, MaintenanceStatus $to): MaintenanceStatus
    {
        $current = $mr->status ?? MaintenanceStatus::Open;

        abort_code_unless(
            $this->canTransitionTo($current, $to),
            422,
            'maintenance.status_transition_invalid', ['from' => $current->value, 'to' => $to->value],
        );

        return $current;
    }

    /**
     * P211.04 (TCK-2193) — chaque geste du devis se joue sur la ligne relue sous `lockForUpdate`,
     * dans une transaction : la table, la validité et le seuil du bailleur se jugent sur elle, et
     * l'événement part après le commit, sur le modèle reçu rechargé. Jugés sur le modèle lié, un
     * rejet puis une approbation simultanés laissaient un devis `approved` portant le motif du rejet.
     *
     * Le geste rend `[from, to, cause, context?]`.
     *
     * @param  Closure(MaintenanceRequest): array<int, mixed>  $geste
     */
    private function underLock(MaintenanceRequest $mr, ?User $actor, Closure $geste): MaintenanceRequest
    {
        [$from, $to, $cause, $context] = DB::transaction(function () use ($mr, $geste): array {
            return $geste($this->requests->lockFresh($mr)) + [3 => []];
        });

        $mr->refresh();

        MaintenanceStatusChanged::dispatch($mr, $from, $to, $actor, $cause, $context);

        return $mr;
    }

    /**
     * ADR-0037 — seul le bailleur sort d'`awaiting_owner`, et `decideQuote` l'a jugé sur le modèle
     * lié. Si la ligne y est passée depuis (un autre membre a approuvé au-delà du plafond), la
     * décision prise sur l'état d'avant ne vaut pas : 422, comme une transition hors table.
     */
    private function assertStillDecidable(MaintenanceRequest $seen, MaintenanceRequest $fresh, MaintenanceStatus $to): void
    {
        $was = $seen->status ?? MaintenanceStatus::Open;
        $now = $fresh->status ?? MaintenanceStatus::Open;

        abort_code_if(
            $now === MaintenanceStatus::AwaitingOwner && $was !== MaintenanceStatus::AwaitingOwner,
            422,
            'maintenance.status_transition_invalid', ['from' => $now->value, 'to' => $to->value],
        );
    }

    public function requestQuote(MaintenanceRequest $mr, ?User $actor = null): MaintenanceRequest
    {
        $mr = $this->underLock($mr, $actor, function (MaintenanceRequest $fresh): array {
            $from = $this->assertTransition($fresh, MaintenanceStatus::QuoteRequested);

            $fresh->status = MaintenanceStatus::QuoteRequested;
            $fresh->save();

            return [$from, MaintenanceStatus::QuoteRequested, MaintenanceStatusChanged::CAUSE_QUOTE_REQUESTED];
        });

        activity()
            ->performedOn($mr)
            ->event('quote.requested')
            ->log('Quote requested');

        return $mr;
    }

    /**
     * TCK-592 (P12) — le montant est CALCULÉ depuis les lignes, en arithmétique décimale exacte
     * (`bcmath`), et la devise IMPOSÉE. Les lignes gardent leurs nombres en chaînes décimales.
     *
     * @param  array<string,mixed>  $data  `lines[]`, `valid_until`, `estimated_duration_days`
     * @param  array<int,UploadedFile>  $attachments
     */
    public function submitQuote(MaintenanceRequest $mr, array $data, array $attachments = [], ?User $actor = null): MaintenanceRequest
    {
        $mr = $this->underLock($mr, $actor, function (MaintenanceRequest $fresh) use ($data, $attachments, $actor): array {
            $from = $this->assertTransition($fresh, MaintenanceStatus::QuoteSubmitted);

            $currency = $this->resolveCurrency($fresh);
            [$lines, $amount] = $this->priceLines($data['lines'] ?? [], $currency);

            $fresh->status = MaintenanceStatus::QuoteSubmitted;
            // Chiffrer l'intervention, c'est l'accepter : le prestataire qui a remis un devis ne la
            // refuse plus (`decline` → 422).
            if ($fresh->accepted_at === null && $actor !== null && $fresh->assigned_to === $actor->id) {
                $fresh->accepted_at = now();
            }
            $fresh->quote_lines = $lines;
            $fresh->quote_amount = $amount;
            $fresh->quote_currency = $currency;
            $fresh->quote_valid_until = $data['valid_until'] ?? null;
            $fresh->quote_estimated_duration_days = $data['estimated_duration_days'] ?? null;
            $fresh->quote_submitted_at = now();
            // Un devis re-soumis après refus repart sans la décision précédente.
            $fresh->quote_decision_at = null;
            $fresh->quote_decision_by_id = null;
            $fresh->quote_rejection_reason = null;
            $fresh->save();

            foreach ($attachments as $attachment) {
                $fresh->addMedia($attachment)->toMediaCollection('quotes');
            }

            return [$from, MaintenanceStatus::QuoteSubmitted, MaintenanceStatusChanged::CAUSE_QUOTE_SUBMITTED];
        });

        activity()
            ->performedOn($mr)
            ->event('quote.submitted')
            ->withProperties(['amount' => $mr->quote_amount, 'currency' => $mr->quote_currency])
            ->log('Quote submitted');

        return $mr;
    }

    /**
     * Chaque ligne, puis le total, à l'UNITÉ de la devise (verif-592, mineur 1) : 0 décimale pour
     * le XOF (principe n°3 : pas de sous-unité). `bcmul(…, 2)` tronquait — 1,5 × 333,33 donnait
     * 499,99 XOF, un montant qu'aucun paiement ne réglera.
     *
     * @param  array<int, array<string, mixed>>  $input
     * @return array{0: list<array{label: string, kind: string, quantity: string, unit_price: string, total: string}>, 1: string}
     */
    public function priceLines(array $input, string $currency = 'XOF'): array
    {
        $scale = Currency::tryFrom($currency)?->decimalPlaces() ?? 2;
        $lines = [];
        $total = '0.00';

        foreach ($input as $line) {
            $quantity = $this->decimal($line['quantity'] ?? 0);
            $unitPrice = $this->decimal($line['unit_price'] ?? 0);
            // Deux facteurs à 2 décimales : le produit exact tient en 4.
            $lineTotal = CurrencyUnit::round(bcmul($quantity, $unitPrice, 4), $scale);

            $lines[] = [
                'label' => (string) ($line['label'] ?? ''),
                'kind' => (string) ($line['kind'] ?? 'labour'),
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'total' => $lineTotal,
            ];
            $total = bcadd($total, $lineTotal, 2);
        }

        $total = CurrencyUnit::round($total, $scale);
        // verif-592 passe 3 (N10) — chaque facteur sous son `max`, le produit dépassait la colonne.
        abort_code_if(bccomp($total, CurrencyUnit::MAX_COLUMN, 2) === 1, 422, 'maintenance.quote_amount_too_large');

        return [$lines, $total];
    }

    private function decimal(mixed $value): string
    {
        return bcadd(is_string($value) ? trim($value) : (string) $value, '0', 2);
    }

    /**
     * TCK-592 — ADR-0037 : au-delà du plafond de travaux du bailleur, l'approbation de l'équipe ne
     * vaut pas approbation — le devis passe en `awaiting_owner`, et le bailleur du bien tranche.
     * Le bailleur qui approuve lui-même approuve directement. Un devis dont la validité est
     * passée ne s'approuve plus (422).
     */
    public function approveQuote(MaintenanceRequest $mr, int $approvedById, ?User $actor = null): MaintenanceRequest
    {
        $seen = $mr;
        $mr = $this->underLock($mr, $actor, function (MaintenanceRequest $fresh) use ($seen, $approvedById): array {
            // P211.04 (TCK-2193) — validité, seuil du bailleur et table jugés sur la ligne fraîche.
            $this->assertNotExpired($fresh);
            $this->assertStillDecidable($seen, $fresh, MaintenanceStatus::Approved);

            $current = $fresh->status ?? MaintenanceStatus::Open;
            $needsOwner = $current === MaintenanceStatus::QuoteSubmitted
                && ! $this->isLandlord($fresh, $approvedById)
                && $this->exceedsOwnerThreshold($fresh);

            if ($needsOwner) {
                $from = $this->assertTransition($fresh, MaintenanceStatus::AwaitingOwner);

                $fresh->status = MaintenanceStatus::AwaitingOwner;
                $fresh->save();

                return [$from, MaintenanceStatus::AwaitingOwner, MaintenanceStatusChanged::CAUSE_QUOTE_AWAITING_OWNER];
            }

            $from = $this->assertTransition($fresh, MaintenanceStatus::Approved);

            $fresh->status = MaintenanceStatus::Approved;
            $fresh->quote_decision_at = now();
            $fresh->quote_decision_by_id = $approvedById;
            $fresh->save();

            return [$from, MaintenanceStatus::Approved, MaintenanceStatusChanged::CAUSE_QUOTE_APPROVED];
        });

        if ($mr->status === MaintenanceStatus::AwaitingOwner) {
            activity()
                ->performedOn($mr)
                ->event('quote.awaiting_owner')
                ->withProperties(['amount' => $mr->quote_amount, 'endorsed_by' => $approvedById])
                ->log('Quote awaiting owner');
        } else {
            activity()
                ->performedOn($mr)
                ->event('quote.approved')
                ->log('Quote approved');
        }

        return $mr;
    }

    private function assertNotExpired(MaintenanceRequest $mr): void
    {
        abort_code_if(
            $mr->quote_valid_until !== null && $mr->quote_valid_until->endOfDay()->isPast(),
            422,
            'maintenance.quote_expired',
        );
    }

    private function isLandlord(MaintenanceRequest $mr, int $userId): bool
    {
        return $this->threshold->isLandlord($mr, $userId);
    }

    /**
     * Le plafond du couple (bailleur du bien, agence du bien) — ADR-0037. Nul : pas d'accord requis.
     */
    private function exceedsOwnerThreshold(MaintenanceRequest $mr): bool
    {
        return $this->threshold->exceeds($mr, $mr->quote_amount);
    }

    public function rejectQuote(MaintenanceRequest $mr, string $reason, int $rejectedById, ?User $actor = null): MaintenanceRequest
    {
        $seen = $mr;
        $mr = $this->underLock($mr, $actor, function (MaintenanceRequest $fresh) use ($seen, $reason, $rejectedById): array {
            $this->assertStillDecidable($seen, $fresh, MaintenanceStatus::Rejected);
            $from = $this->assertTransition($fresh, MaintenanceStatus::Rejected);

            $fresh->status = MaintenanceStatus::Rejected;
            $fresh->quote_decision_at = now();
            $fresh->quote_decision_by_id = $rejectedById;
            $fresh->quote_rejection_reason = $reason;
            $fresh->save();

            return [$from, MaintenanceStatus::Rejected, MaintenanceStatusChanged::CAUSE_QUOTE_REJECTED, ['reason' => $reason]];
        });

        activity()
            ->performedOn($mr)
            ->event('quote.rejected')
            ->withProperties(['reason' => $reason])
            ->log('Quote rejected');

        return $mr;
    }

    /**
     * TCK-592 — démarrer emprunte LA transition du service : `started_at`, `accepted_at` (démarrer,
     * c'est accepter) et l'événement y vivent une seule fois.
     */
    public function start(MaintenanceRequest $mr, ?User $actor = null): MaintenanceRequest
    {
        $this->assertTransition($mr, MaintenanceStatus::InProgress);

        $mr = $this->requests->transition($mr, MaintenanceStatus::InProgress, $actor);

        activity()
            ->performedOn($mr)
            ->event('maintenance.started')
            ->log('Maintenance started');

        return $mr;
    }

    protected function resolveCurrency(MaintenanceRequest $mr): string
    {
        if ($mr->lease?->currency) {
            return $mr->lease->currency->value;
        }

        if ($mr->property?->agency?->currency) {
            return $mr->property->agency->currency->value;
        }

        return 'XOF';
    }
}
