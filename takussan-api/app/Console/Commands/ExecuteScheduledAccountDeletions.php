<?php

namespace App\Console\Commands;

use App\Models\AccountDeletionRequest;
use App\Notifications\AccountDeletionReminderNotification;
use App\Services\Account\AccountDeletionService;
use App\Support\Logging\SafeExceptionContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

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
            // P193.04 (TCK-2051) — sans e-mail ni numéro vérifié, aucun canal : le rappel n'est ni
            // envoyé ni marqué, il n'était compté envoyé que parce que `MailChannel` se taisait.
            $user = $request->user;
            if ($user === null || AccountDeletionReminderNotification::canauxPour($user) === []) {
                continue;
            }
            if (! $dryRun) {
                // P229.04 (TCK-2227) — la demande est réclamée avant l'envoi, par une mise à jour
                // conditionnelle : une demande annulée (supprimée) ou déjà rappelée pendant le
                // passage ne prend aucune ligne, et rien ne part.
                $now = now();
                $pris = AccountDeletionRequest::query()
                    ->whereKey($request->getKey())
                    ->whereNull('executed_at')
                    ->whereNull('reminder_sent_at')
                    ->where('scheduled_for', '>', $now)
                    ->update(['reminder_sent_at' => $now, 'updated_at' => $now]);
                if ($pris === 0) {
                    continue;
                }
                $request->refresh();

                try {
                    $user->notify(new AccountDeletionReminderNotification($request));
                } catch (Throwable $e) {
                    // Comme avant la réclamation : un envoi qui lève ne compte pas pour posé.
                    $request->forceFill(['reminder_sent_at' => null])->save();

                    throw $e;
                }
            }
            $remindersSent++;
        }

        $executions = 0;
        $failures = 0;
        foreach ($this->service->dueForExecution() as $request) {
            /** @var AccountDeletionRequest $request */
            if (! $dryRun) {
                // TCK-741 (P05.04) — une demande en échec ne bloque pas les suivantes. Elle garde
                // `executed_at` nul et sera retentée au passage suivant ; le journal ne porte que
                // la forme sûre de l'exception (ADR-0044), jamais son message.
                try {
                    $this->service->executeDeletion($request);
                } catch (Throwable $e) {
                    $failures++;
                    Log::error('[account-deletion] exécution en échec', [
                        'account_deletion_request_id' => $request->id,
                    ] + SafeExceptionContext::of($e));

                    continue;
                }
            }
            $executions++;
        }

        $this->info(sprintf(
            'account:execute-deletions — reminders=%d executions=%d failures=%d%s',
            $remindersSent,
            $executions,
            $failures,
            $dryRun ? ' (dry-run)' : '',
        ));

        // Un échec au moins : la commande sort en échec, après avoir traité toutes les autres,
        // pour que `scheduled_task_runs` le dise.
        return $failures > 0 ? self::FAILURE : self::SUCCESS;
    }
}
