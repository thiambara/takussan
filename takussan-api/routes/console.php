<?php

use App\Jobs\ApplyLatePaymentPenalties;
use App\Jobs\ExpireBookings;
use App\Jobs\SendLeasePaymentReminders;
use App\Jobs\SendOverdueInvoiceReminders;
use App\Jobs\SendPropertyVisitReminders;
use App\Jobs\SendSavedSearchAlerts;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::job(new ExpireBookings)->hourly()->withoutOverlapping();
Schedule::job(new ApplyLatePaymentPenalties)->dailyAt('06:00')->withoutOverlapping();
Schedule::job(new SendLeasePaymentReminders)->dailyAt('08:00');
Schedule::job(new SendSavedSearchAlerts)->dailyAt('09:00');
Schedule::job(new SendPropertyVisitReminders)->dailyAt('07:00');
Schedule::job(new SendOverdueInvoiceReminders)->dailyAt('10:00');
Schedule::command('media:cleanup')->dailyAt('03:00');
