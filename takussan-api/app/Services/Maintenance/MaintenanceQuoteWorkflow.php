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
     * @param  array<string,mixed>  $data
     * @param  array<int,UploadedFile>  $attachments
     */
    public function submitQuote(MaintenanceRequest $mr, array $data, array $attachments = [], ?User $actor = null): MaintenanceRequest
    {
        $from = $this->assertTransition($mr, MaintenanceStatus::QuoteSubmitted);

        $mr->status = MaintenanceStatus::QuoteSubmitted;
        // Chiffrer l'intervention, c'est l'accepter : le prestataire qui a remis un devis ne la
        // refuse plus (`decline` → 422).
        if ($mr->accepted_at === null && $actor !== null && $mr->assigned_to === $actor->id) {
            $mr->accepted_at = now();
        }
        $mr->quote_amount = $data['amount'];
        $mr->quote_currency = $data['currency'] ?? $this->resolveCurrency($mr);
        $mr->quote_submitted_at = now();
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

    public function approveQuote(MaintenanceRequest $mr, int $approvedById, ?User $actor = null): MaintenanceRequest
    {
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
