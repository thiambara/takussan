<?php

namespace App\Console\Commands;

use App\Jobs\Notifications\BuildUserDigestJob;
use App\Models\Enums\EmailFrequency;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * TCK-103 — Dev helper: trigger a digest immediately for a given user.
 *
 * Usage: php artisan notifications:digest-preview {user_id}
 *
 * Temporarily overrides email_frequency to 'daily' so the job always runs,
 * then restores the original value. Does NOT persist the change.
 */
class NotificationDigestPreviewCommand extends Command
{
    protected $signature = 'notifications:digest-preview {user_id : ID of the user to preview the digest for}';

    protected $description = 'Send an immediate digest preview email to a user (dev/test mode)';

    public function handle(): int
    {
        $userId = $this->argument('user_id');
        $user = User::find($userId);

        if (! $user) {
            $this->error("User #{$userId} not found.");

            return self::FAILURE;
        }

        if (! $user->email) {
            $this->error("User #{$userId} has no email address.");

            return self::FAILURE;
        }

        // Force daily frequency without persisting so the job always fires.
        $original = $user->email_frequency;
        $user->email_frequency = EmailFrequency::Daily;

        $this->info("Dispatching digest preview for {$user->email}…");
        BuildUserDigestJob::dispatchSync($user);

        $user->email_frequency = $original;

        $this->info('Done.');

        return self::SUCCESS;
    }
}
