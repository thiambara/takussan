<?php

namespace App\Listeners\Accounting;

use App\Events\Accounting\BankStatementImported;
use App\Models\BankStatement;
use App\Models\Enums\NotificationType;
use App\Services\Model\NotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;

class NotifyStatementImported implements ShouldQueue
{
    public function __construct(private readonly NotificationService $notificationService) {}

    public function handle(BankStatementImported $event): void
    {
        $statement = $event->statement;
        $user = $statement->uploadedBy;

        if (! $user) {
            return;
        }

        $title = __('reconciliation.notifications.imported.title');
        $body = __('reconciliation.notifications.imported.body', [
            'bank' => $statement->bank_name ?? '—',
            'lines_count' => $statement->lines_count,
        ]);

        $this->notificationService->notify(
            user: $user,
            type: NotificationType::BankStatementImported,
            title: $title,
            body: $body,
            referenceableType: BankStatement::class,
            referenceableId: $statement->id,
        );
    }
}
