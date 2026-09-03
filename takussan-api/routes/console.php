<?php

use App\Jobs\Billing\ProcessTrialExpirations;
use App\Jobs\Booking\ExpirePendingBookingsJob;
use App\Jobs\EscalateUrgentMaintenanceJob;
use App\Jobs\ExpireBookings;
use App\Jobs\Invoice\SendOverdueRemindersJob;
use App\Jobs\Lease\ApplyLateFeesJob;
use App\Jobs\Lease\ConfirmEarlyTerminationsJob;
use App\Jobs\Notifications\SendNotificationDigestJob;
use App\Jobs\Permissions\ProcessRoleDelegationsJob;
use App\Jobs\Privacy\PurgeExpiredDataExports;
use App\Jobs\RefreshNewBuildSearchLabel;
use App\Jobs\SendLeasePaymentReminders;
use App\Jobs\SendPropertyVisitReminders;
use App\Jobs\SendSavedSearchAlerts;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// TCK-101 — Auto-expires pending bookings whose `created_at` is older than the
// agency-configured threshold. Distinct from `ExpireBookings` below, which
// handles the legacy `expires_at` deadline set at booking creation.
Schedule::job(new ExpirePendingBookingsJob)->everyFifteenMinutes()->withoutOverlapping();
Schedule::job(new ExpireBookings)->hourly()->withoutOverlapping();
Schedule::job(new ApplyLateFeesJob)->dailyAt('02:00')->withoutOverlapping();
Schedule::job(new ProcessTrialExpirations)->dailyAt('02:15')->withoutOverlapping();
// TCK-090 — Closes leases whose effective_date has passed AND whose
// penalty invoice is settled. Idempotent: unpaid penalties are skipped
// silently and reprocessed on the next sweep.
Schedule::job(new ConfirmEarlyTerminationsJob)->dailyAt('03:00')->withoutOverlapping();
Schedule::job(new SendLeasePaymentReminders)->dailyAt('08:00');
Schedule::job(new SendSavedSearchAlerts)->dailyAt('09:00');
// TCK-092 — Per-offset overdue invoice reminders (default J+3, J+7, J+15).
// Replaces the legacy `SendOverdueInvoiceReminders` (single-shot mark-and-
// notify). Idempotent on `reminders_sent_count`; agency-scoped queries.
Schedule::job(new SendOverdueRemindersJob)->dailyAt('09:00')->withoutOverlapping();
// TCK-075 — Runs every 5 minutes to flush reminders for both the 24h and 1h
// pre-visit windows. Dedup happens through `PropertyVisit.metadata` markers
// so re-runs are idempotent even if the job overlaps with a prior tick.
Schedule::job(new SendPropertyVisitReminders)->everyFiveMinutes()->withoutOverlapping();
// TCK-103 — Hourly digest orchestrator: checks users whose local time matches
// their digest_send_at and dispatches per-user BuildUserDigestJob sub-jobs.
Schedule::job(new SendNotificationDigestJob)->hourly()->withoutOverlapping();
Schedule::command('media:cleanup')->dailyAt('03:00');
// TCK-506 (revue de PR 253) — « neuf » est figé à l'indexation : sans ceci, un
// bien de 2025 indexé en 2026 répond encore à `q=neuf` en 2028.
Schedule::job(new RefreshNewBuildSearchLabel)->dailyAt('04:00')->withoutOverlapping();
Schedule::command('dashboard:check-alerts')->hourly()->withoutOverlapping(); // TCK-032 P3
// TCK-083 — Hourly reminder for tasks whose `due_at` falls in the
// 23–25 h window. Idempotence is guaranteed by the marker stored in
// `tasks.metadata.reminder_24h_sent_at` (see SendTaskDueReminders).
Schedule::command('tasks:send-due-reminders')->hourly()->withoutOverlapping();
// TCK-080 — RGPD: send J-N reminders + execute scheduled anonymizations.
Schedule::command('account:execute-deletions')->hourly()->withoutOverlapping();
// TCK-225 — RGPD portability archives expire after 7 days.
Schedule::job(new PurgeExpiredDataExports)->dailyAt('02:30')->withoutOverlapping();
// TCK-096 — Escalate urgent maintenance requests to agency managers
Schedule::job(new EscalateUrgentMaintenanceJob)->hourly()->withoutOverlapping();

// TCK-108 — Process role delegation activation and expiration
Schedule::job(new ProcessRoleDelegationsJob)->everyFiveMinutes()->withoutOverlapping();

// TCK-249 — Invitation lifecycle sweepers (hourly, both idempotent).
//  - `invitations:expire` flips `sent → expired` once `expires_at` is past
//    and notifies the inviter.
//  - `invitations:remind` emails a J+2 reminder to invitees who haven't
//    accepted yet, using `last_reminded_at` for dedup.
Schedule::command('invitations:expire')->hourly()->withoutOverlapping();
Schedule::command('invitations:remind')->hourly()->withoutOverlapping();

// TCK-250 — Garbage-collect resumable wizard drafts older than 90 days.
Schedule::command('wizard-drafts:purge')->dailyAt('03:30')->withoutOverlapping();

// TCK-266 — Hourly J+7 reminder for tenants whose move-in inventory is
// still unsigned. Idempotent via `tenant_onboarding_checklists.reminders_sent`.
Schedule::command('tenant-onboarding:remind')->hourly()->withoutOverlapping();

// TCK-294 — Pull Mtarget delivery reports instead of receiving them on an
// unauthenticatable webhook (ardoise D-49).
//
// Idempotence. Mtarget's pulling read is DESTRUCTIVE — a successful call
// empties the queue it returns — so a re-run never re-reads the same
// reports, and safety cannot come from the read side. It comes from the
// write side: a report only ever UPDATEs the delivery attempt matched on
// `(provider, provider_message_id)`, never inserts one; writing the same
// status twice is a no-op; and a status precedence blocks any regression
// (a report drained out of order cannot walk `delivered` backwards). The
// command is therefore safe to replay at any moment, and a failed call
// stops the drain instead of consuming reports our side cannot store.
//
// Cadence — every five minutes, arbitrated rather than guessed:
//  · nothing user-facing waits on a DLR (they feed reporting and the
//    delivery status of a notification), so sub-minute freshness buys
//    nothing;
//  · Mtarget keeps reports for one month, so the cadence carries no risk
//    of loss — only of latency;
//  · the operator's own advice is to poll while results come back and to
//    space out the calls when the queue is empty, which is exactly the
//    shape here: one tick drains up to `max_per_call × max_batches`
//    reports in a loop, then waits five minutes;
//  · the floor cost is 288 calls a day per account when nothing is
//    pending — negligible against any plausible quota.
// `withoutOverlapping()` keeps two drains off the same queue; the run is
// a no-op while `sms.dlr_pulling.enabled` is false (its default).
Schedule::command('sms:pull-mtarget-dlr')->everyFiveMinutes()->withoutOverlapping();
