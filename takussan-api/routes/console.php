<?php

use App\Jobs\ApplyLatePaymentPenalties;
use App\Jobs\ExpireBookings;
use App\Jobs\SendLeasePaymentReminders;
use App\Jobs\SendSavedSearchAlerts;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::job(new ExpireBookings)->hourly();
Schedule::job(new ApplyLatePaymentPenalties)->dailyAt('06:00');
Schedule::job(new SendLeasePaymentReminders)->dailyAt('08:00');
Schedule::job(new SendSavedSearchAlerts)->dailyAt('09:00');
