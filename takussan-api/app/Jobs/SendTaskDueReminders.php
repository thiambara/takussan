<?php

namespace App\Jobs;

use App\Models\Enums\TaskStatus;
use App\Models\Enums\UserStatus;
use App\Models\Task;
use App\Notifications\TaskDueReminderNotification;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-083 — Sends a single reminder per task ~24 h before its `due_at`.
 *
 * Scheduled hourly (see `routes/console.php`). Each tick claims a fresh
 * row lock on the matched task, re-checks the marker inside the
 * transaction, and only dispatches if `metadata.reminder_24h_sent_at` is
 * still empty. This makes the job safe under parallel scheduler ticks
 * without relying on DB-specific JSON_SET semantics.
 *
 * Window: tasks whose `due_at` falls in (now+23h, now+25h). We tolerate
 * a 2 h cone (instead of the 5-min cone used by visit reminders) because
 * this job runs hourly, not every 5 minutes — without it, a reminder
 * scheduled for, say, 15:30 next day would never overlap with a 15:00 or
 * 16:00 hourly tick.
 *
 * P126.01 (TCK-1248) — sur un dossier d'agence, le rappel ne part qu'à un assigné qui est encore
 * personnel actif de cette agence (`isStaffAt`) : un profil suspendu ne confère plus aucun
 * périmètre (ADR-0031 § 3), la tâche ne lui est plus ouverte. Sans repli : personne d'autre n'est
 * prévenu à sa place, et le marqueur n'est pas posé.
 */
class SendTaskDueReminders implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public const META_MARKER = 'reminder_24h_sent_at';

    private const WINDOW_FROM_HOURS = 23;

    private const WINDOW_TO_HOURS = 25;

    public function handle(): void
    {
        $from = now()->addHours(self::WINDOW_FROM_HOURS);
        $to = now()->addHours(self::WINDOW_TO_HOURS);

        Task::query()
            ->whereIn('status', [TaskStatus::Open->value, TaskStatus::InProgress->value])
            ->whereNotNull('due_at')
            ->whereBetween('due_at', [$from, $to])
            ->whereNotNull('assigned_to_id')
            // TCK-1350 (P88.04) — ni compte bloqué ni compte supprimé.
            ->whereHas('assignee', fn ($q) => $q->whereNotIn('status', [UserStatus::Blocked->value, UserStatus::Deleted->value]))
            ->chunkById(100, function ($tasks) {
                foreach ($tasks as $task) {
                    $this->notifyFor($task);
                }
            });
    }

    private function notifyFor(Task $task): void
    {
        DB::transaction(function () use ($task) {
            /** @var Task|null $fresh */
            $fresh = Task::query()
                ->whereKey($task->id)
                ->lockForUpdate()
                ->first();

            if (! $fresh || $fresh->assigned_to_id === null) {
                return;
            }

            $metadata = $fresh->metadata ?? [];
            if (! empty($metadata[self::META_MARKER])) {
                return;
            }

            $fresh->loadMissing('assignee');
            if (! $fresh->assignee) {
                return;
            }

            $agencyId = $fresh->parentAgencyId();
            if ($agencyId !== null
                && ! app(MembershipCapabilityResolver::class)->isStaffAt($fresh->assignee, $agencyId)) {
                return;
            }

            Notification::send($fresh->assignee, new TaskDueReminderNotification($fresh));

            $metadata[self::META_MARKER] = now()->toIso8601String();
            $fresh->forceFill(['metadata' => $metadata])->save();
        });
    }
}
