<?php

use App\Jobs\ExpireBookings;
use App\Jobs\Invoice\SendOverdueRemindersJob;
use App\Jobs\Lease\ApplyLateFeesJob;
use App\Jobs\Lease\ConfirmEarlyTerminationsJob;
use App\Jobs\SendDailyNotificationDigest;
use App\Jobs\SendLeasePaymentReminders;
use App\Jobs\SendPropertyVisitReminders;
use App\Jobs\SendSavedSearchAlerts;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::job(new ExpireBookings)->hourly()->withoutOverlapping();
Schedule::job(new ApplyLateFeesJob)->dailyAt('02:00')->withoutOverlapping();
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
Schedule::job(new SendDailyNotificationDigest)->dailyAt('18:00');
Schedule::command('media:cleanup')->dailyAt('03:00');
Schedule::command('dashboard:check-alerts')->hourly()->withoutOverlapping(); // TCK-032 P3
// TCK-083 — Hourly reminder for tasks whose `due_at` falls in the
// 23–25 h window. Idempotence is guaranteed by the marker stored in
// `tasks.metadata.reminder_24h_sent_at` (see SendTaskDueReminders).
Schedule::command('tasks:send-due-reminders')->hourly()->withoutOverlapping();
// TCK-080 — RGPD: send J-N reminders + execute scheduled anonymizations.
Schedule::command('account:execute-deletions')->hourly()->withoutOverlapping();
