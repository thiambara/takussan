<?php

namespace App\Console\Commands;

use App\Models\AccountDeletionRequest;
use App\Notifications\AccountDeletionReminderNotification;
use App\Services\Account\AccountDeletionService;
use Illuminate\Console\Command;

/**
 * TCK-080 — sweeper that runs hourly:
 *  - Sends J-N reminders (default J-7) to users whose deletion is approaching.
 *  - Executes deletions whose `scheduled_for` is in the past.
 *
 * Idempotent on both fronts: `reminder_sent_at` and `executed_at` flags
 * make double-runs no-ops.
 */
class ExecuteScheduledAccountDeletions extends Command
{
    protected $signature = 'account:execute-deletions {--dry-run : Print what would happen, do nothing}';

    protected $description = 'Execute scheduled RGPD account deletions and send J-N reminders.';

    public function __construct(private readonly AccountDeletionService $service)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $remindersSent = 0;
        foreach ($this->service->dueForReminder() as $request) {
            /** @var AccountDeletionRequest $request */
            if (! $dryRun) {
                $request->user?->notify(new AccountDeletionReminderNotification($request));
                $request->forceFill(['reminder_sent_at' => now()])->save();
            }
            $remindersSent++;
        }

        $executions = 0;
        foreach ($this->service->dueForExecution() as $request) {
            /** @var AccountDeletionRequest $request */
            if (! $dryRun) {
                $this->service->executeDeletion($request);
            }
            $executions++;
        }

        $this->info(sprintf(
            'account:execute-deletions — reminders=%d executions=%d%s',
            $remindersSent,
            $executions,
            $dryRun ? ' (dry-run)' : '',
        ));

        return self::SUCCESS;
    }
}
