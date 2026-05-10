<?php

namespace App\Console\Commands;

use App\Services\Invitation\InvitationService;
use Illuminate\Console\Command;

/**
 * TCK-249 — hourly sweeper that flips `sent` invitations whose
 * `expires_at` is in the past to `expired`, then notifies the inviter.
 *
 * Idempotent: invitations already in a terminal status are skipped by
 * the underlying service scope.
 */
class ExpireInvitations extends Command
{
    protected $signature = 'invitations:expire';

    protected $description = 'Expire pending invitations whose expires_at is past.';

    public function __construct(private readonly InvitationService $service)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $expired = $this->service->expire();
        $this->info("Expired {$expired->count()} invitation(s).");

        return self::SUCCESS;
    }
}
