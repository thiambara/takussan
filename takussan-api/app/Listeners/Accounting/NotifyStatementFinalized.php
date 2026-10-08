<?php

namespace App\Listeners\Accounting;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Accounting\BankStatementFinalized;
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
        // TCK-588 (ADR-0032) — des paramètres bruts, rendus dans la langue de CHAQUE destinataire.
        $params = [
            'period_start' => $statement->period_start?->toDateString(),
            'period_end' => $statement->period_end?->toDateString(),
            'confirmed' => $ratio['confirmed'],
            'total' => $ratio['total'],
        ];
        $target = NotificationTarget::of('finances');

        $this->notificationService->send($finalizer, NotificationCode::BankStatementFinalized, $params, $target);

        // Also notify primary admin if different from finalizer
        $primaryAdmin = $statement->agency?->primaryAdmin;
        if ($primaryAdmin && $primaryAdmin->id !== $finalizer->id) {
            $this->notificationService->send($primaryAdmin, NotificationCode::BankStatementFinalized, $params, $target);
        }
    }
}
