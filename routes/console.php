<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

// purge telescope entries older than 7 days
Schedule::command('telescope:prune')->weekly();

// check for expired sanctum tokens every 24 hours
Schedule::command('sanctum:prune-expired --hours=24')->daily();




