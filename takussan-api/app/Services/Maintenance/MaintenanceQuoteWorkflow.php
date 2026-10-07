<?php

namespace App\Services\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Http\UploadedFile;

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

        abort_unless(
            $this->canTransitionTo($current, $to),
            422,
            __('maintenance.errors.transition_not_allowed', ['from' => $current->value, 'to' => $to->value]),
        );

        return $current;
    }

    public function requestQuote(MaintenanceRequest $mr, ?User $actor = null): MaintenanceRequest
    {
        $from = $this->assertTransition($mr, MaintenanceStatus::QuoteRequested);

        $mr->status = MaintenanceStatus::QuoteRequested;
        $mr->save();

        activity()
            ->performedOn($mr)
            ->event('quote.requested')
            ->log('Quote requested');

        MaintenanceStatusChanged::dispatch($mr, $from, MaintenanceStatus::QuoteRequested, $actor, MaintenanceStatusChanged::CAUSE_QUOTE_REQUESTED);

        return $mr->refresh();
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
        $from = $this->assertTransition($mr, MaintenanceStatus::QuoteSubmitted);

        [$lines, $amount] = $this->priceLines($data['lines'] ?? []);

        $mr->status = MaintenanceStatus::QuoteSubmitted;
        // Chiffrer l'intervention, c'est l'accepter : le prestataire qui a remis un devis ne la
        // refuse plus (`decline` → 422).
        if ($mr->accepted_at === null && $actor !== null && $mr->assigned_to === $actor->id) {
            $mr->accepted_at = now();
        }
        $mr->quote_lines = $lines;
        $mr->quote_amount = $amount;
        $mr->quote_currency = $this->resolveCurrency($mr);
        $mr->quote_valid_until = $data['valid_until'] ?? null;
        $mr->quote_estimated_duration_days = $data['estimated_duration_days'] ?? null;
        $mr->quote_submitted_at = now();
        // Un devis re-soumis après refus repart sans la décision précédente.
        $mr->quote_decision_at = null;
        $mr->quote_decision_by_id = null;
        $mr->quote_rejection_reason = null;
        $mr->save();

        foreach ($attachments as $attachment) {
            $mr->addMedia($attachment)->toMediaCollection('quotes');
        }

        activity()
            ->performedOn($mr)
            ->event('quote.submitted')
            ->withProperties(['amount' => $mr->quote_amount, 'currency' => $mr->quote_currency])
            ->log('Quote submitted');

        MaintenanceStatusChanged::dispatch($mr, $from, MaintenanceStatus::QuoteSubmitted, $actor, MaintenanceStatusChanged::CAUSE_QUOTE_SUBMITTED);

        return $mr->refresh();
    }

    /**
     * @param  array<int, array<string, mixed>>  $input
     * @return array{0: list<array{label: string, kind: string, quantity: string, unit_price: string, total: string}>, 1: string}
     */
    public function priceLines(array $input): array
    {
        $lines = [];
        $total = '0.00';

        foreach ($input as $line) {
            $quantity = $this->decimal($line['quantity'] ?? 0);
            $unitPrice = $this->decimal($line['unit_price'] ?? 0);
            $lineTotal = bcmul($quantity, $unitPrice, 2);

            $lines[] = [
                'label' => (string) ($line['label'] ?? ''),
                'kind' => (string) ($line['kind'] ?? 'labour'),
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'total' => $lineTotal,
            ];
            $total = bcadd($total, $lineTotal, 2);
        }

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
        $this->assertNotExpired($mr);

        $current = $mr->status ?? MaintenanceStatus::Open;
        $needsOwner = $current === MaintenanceStatus::QuoteSubmitted
            && ! $this->isLandlord($mr, $approvedById)
            && $this->exceedsOwnerThreshold($mr);

        if ($needsOwner) {
            $from = $this->assertTransition($mr, MaintenanceStatus::AwaitingOwner);

            $mr->status = MaintenanceStatus::AwaitingOwner;
            $mr->save();

            activity()
                ->performedOn($mr)
                ->event('quote.awaiting_owner')
                ->withProperties(['amount' => $mr->quote_amount, 'endorsed_by' => $approvedById])
                ->log('Quote awaiting owner');

            MaintenanceStatusChanged::dispatch($mr, $from, MaintenanceStatus::AwaitingOwner, $actor, MaintenanceStatusChanged::CAUSE_QUOTE_AWAITING_OWNER);

            return $mr->refresh();
        }

        $from = $this->assertTransition($mr, MaintenanceStatus::Approved);

        $mr->status = MaintenanceStatus::Approved;
        $mr->quote_decision_at = now();
        $mr->quote_decision_by_id = $approvedById;
        $mr->save();

        activity()
            ->performedOn($mr)
            ->event('quote.approved')
            ->log('Quote approved');

        MaintenanceStatusChanged::dispatch($mr, $from, MaintenanceStatus::Approved, $actor, MaintenanceStatusChanged::CAUSE_QUOTE_APPROVED);

        return $mr->refresh();
    }

    private function assertNotExpired(MaintenanceRequest $mr): void
    {
        abort_if(
            $mr->quote_valid_until !== null && $mr->quote_valid_until->endOfDay()->isPast(),
            422,
            __('maintenance.errors.quote_expired'),
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
        $from = $this->assertTransition($mr, MaintenanceStatus::Rejected);

        $mr->status = MaintenanceStatus::Rejected;
        $mr->quote_decision_at = now();
        $mr->quote_decision_by_id = $rejectedById;
        $mr->quote_rejection_reason = $reason;
        $mr->save();

        activity()
            ->performedOn($mr)
            ->event('quote.rejected')
            ->withProperties(['reason' => $reason])
            ->log('Quote rejected');

        MaintenanceStatusChanged::dispatch($mr, $from, MaintenanceStatus::Rejected, $actor, MaintenanceStatusChanged::CAUSE_QUOTE_REJECTED, ['reason' => $reason]);

        return $mr->refresh();
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
