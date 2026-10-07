<?php

namespace App\Listeners\Accounting;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Accounting\BankStatementImported;
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

        // TCK-588 (ADR-0032) — rendu dans la langue du destinataire, pas dans celle du worker.
        $this->notificationService->send($user, NotificationCode::BankStatementImported, [
            'bank' => $statement->bank_name,
            'lines' => (int) $statement->lines_count,
        ], NotificationTarget::of('finances'));
    }
}
