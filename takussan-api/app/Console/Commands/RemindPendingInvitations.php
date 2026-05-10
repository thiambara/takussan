<?php

namespace App\Console\Commands;

use App\Services\Invitation\InvitationService;
use Illuminate\Console\Command;

/**
 * TCK-249 — hourly sweeper that emails a J+2 reminder to invitees who
 * haven't accepted yet. Idempotent via `last_reminded_at` so subsequent
 * runs are no-ops for invitations already reminded.
 */
class RemindPendingInvitations extends Command
{
    protected $signature = 'invitations:remind';

    protected $description = 'Send J+2 reminder for pending invitations (idempotent).';

    public function __construct(private readonly InvitationService $service)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $reminded = $this->service->remindPending();
        $this->info("Sent {$reminded->count()} reminder(s).");

        return self::SUCCESS;
    }
}
