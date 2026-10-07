<?php

namespace App\Services\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use Illuminate\Http\UploadedFile;

class MaintenanceQuoteWorkflow
{
    public function __construct(private readonly MaintenanceStateMachine $machine) {}

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

    public function requestQuote(MaintenanceRequest $mr): MaintenanceRequest
    {
        $this->assertTransition($mr, MaintenanceStatus::QuoteRequested);

        $mr->status = MaintenanceStatus::QuoteRequested;
        $mr->save();

        activity()
            ->performedOn($mr)
            ->event('quote.requested')
            ->log('Quote requested');

        return $mr->refresh();
    }

    /**
     * @param  array<string,mixed>  $data
     * @param  array<int,UploadedFile>  $attachments
     */
    public function submitQuote(MaintenanceRequest $mr, array $data, array $attachments = []): MaintenanceRequest
    {
        $this->assertTransition($mr, MaintenanceStatus::QuoteSubmitted);

        $mr->status = MaintenanceStatus::QuoteSubmitted;
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

        return $mr->refresh();
    }

    public function approveQuote(MaintenanceRequest $mr, int $approvedById): MaintenanceRequest
    {
        $this->assertTransition($mr, MaintenanceStatus::Approved);

        $mr->status = MaintenanceStatus::Approved;
        $mr->quote_decision_at = now();
        $mr->quote_decision_by_id = $approvedById;
        $mr->save();

        activity()
            ->performedOn($mr)
            ->event('quote.approved')
            ->log('Quote approved');

        return $mr->refresh();
    }

    public function rejectQuote(MaintenanceRequest $mr, string $reason, int $rejectedById): MaintenanceRequest
    {
        $this->assertTransition($mr, MaintenanceStatus::Rejected);

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

        return $mr->refresh();
    }

    public function start(MaintenanceRequest $mr): MaintenanceRequest
    {
        $this->assertTransition($mr, MaintenanceStatus::InProgress);

        $mr->status = MaintenanceStatus::InProgress;
        $mr->started_at = now();
        $mr->save();

        activity()
            ->performedOn($mr)
            ->event('maintenance.started')
            ->log('Maintenance started');

        return $mr->refresh();
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
