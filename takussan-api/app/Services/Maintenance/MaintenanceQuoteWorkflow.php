<?php

namespace App\Services\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use Illuminate\Http\UploadedFile;

class MaintenanceQuoteWorkflow
{
    /**
     * @var array<string, array<int, string>>
     */
    protected const TRANSITIONS = [
        'open' => ['quote_requested'],
        'quote_requested' => ['quote_submitted'],
        'rejected' => ['quote_submitted'],
        'quote_submitted' => ['approved', 'rejected'],
        'approved' => ['in_progress'],
    ];

    public function canTransitionTo(MaintenanceStatus $from, MaintenanceStatus $to): bool
    {
        $allowed = self::TRANSITIONS[$from->value] ?? [];

        return in_array($to->value, $allowed, true);
    }

    public function requestQuote(MaintenanceRequest $mr): MaintenanceRequest
    {
        $current = $mr->status ?? MaintenanceStatus::Open;

        abort_unless(
            $this->canTransitionTo($current, MaintenanceStatus::QuoteRequested),
            422,
            "Transition from {$current->value} to quote_requested is not allowed."
        );

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
        $current = $mr->status ?? MaintenanceStatus::Open;

        abort_unless(
            $this->canTransitionTo($current, MaintenanceStatus::QuoteSubmitted),
            422,
            "Transition from {$current->value} to quote_submitted is not allowed."
        );

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
        $current = $mr->status ?? MaintenanceStatus::Open;

        abort_unless(
            $this->canTransitionTo($current, MaintenanceStatus::Approved),
            422,
            "Transition from {$current->value} to approved is not allowed."
        );

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
        $current = $mr->status ?? MaintenanceStatus::Open;

        abort_unless(
            $this->canTransitionTo($current, MaintenanceStatus::Rejected),
            422,
            "Transition from {$current->value} to rejected is not allowed."
        );

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
        $current = $mr->status ?? MaintenanceStatus::Open;

        abort_unless(
            $this->canTransitionTo($current, MaintenanceStatus::InProgress),
            422,
            "Transition from {$current->value} to in_progress is not allowed."
        );

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
