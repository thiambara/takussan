<?php

namespace App\Listeners\Accounting;

use App\Events\Accounting\BankStatementFinalized;
use App\Models\BankStatement;
use App\Models\Enums\NotificationType;
use App\Services\Model\NotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;

class NotifyStatementFinalized implements ShouldQueue
{
    public function __construct(private readonly NotificationService $notificationService) {}

    public function handle(BankStatementFinalized $event): void
    {
        $statement = $event->statement;
        $finalizer = $statement->finalizedBy;

        if (! $finalizer) {
            return;
        }

        $ratio = $statement->reconciled_ratio;
        $period = collect([$statement->period_start?->format('d/m/Y'), $statement->period_end?->format('d/m/Y')])
            ->filter()
            ->implode(' – ');

        $title = __('reconciliation.notifications.finalized.title');
        $body = __('reconciliation.notifications.finalized.body', [
            'period' => $period ?: '—',
            'confirmed' => $ratio['confirmed'],
            'total' => $ratio['total'],
        ]);

        $this->notificationService->notify(
            user: $finalizer,
            type: NotificationType::BankStatementFinalized,
            title: $title,
            body: $body,
            referenceableType: BankStatement::class,
            referenceableId: $statement->id,
        );

        // Also notify primary admin if different from finalizer
        $primaryAdmin = $statement->agency?->primaryAdmin;
        if ($primaryAdmin && $primaryAdmin->id !== $finalizer->id) {
            $this->notificationService->notify(
                user: $primaryAdmin,
                type: NotificationType::BankStatementFinalized,
                title: $title,
                body: $body,
                referenceableType: BankStatement::class,
                referenceableId: $statement->id,
            );
        }
    }
}
