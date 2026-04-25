<?php

namespace App\Console\Commands;

use App\Jobs\SendTaskDueReminders;
use Illuminate\Console\Command;

/**
 * TCK-083 — Wraps {@see SendTaskDueReminders} so it can be invoked from a
 * standard cron / `artisan` entry point.
 */
class SendTaskDueRemindersCommand extends Command
{
    protected $signature = 'tasks:send-due-reminders';

    protected $description = 'Send reminder notifications for tasks due in ~24 hours.';

    public function handle(): int
    {
        (new SendTaskDueReminders)->handle();
        $this->info('Task due reminders dispatched.');

        return self::SUCCESS;
    }
}
