<?php

namespace App\Events;

use App\Models\AgencyUpgradeRequest;
use App\Services\Agency\AgencyUpgradeReviewService;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-268 — Fired by {@see AgencyUpgradeReviewService::approve()}
 * once a super-admin approves an upgrade request.
 *
 * Consumed by TCK-269 to perform the actual `Agency.kind = standard` flip
 * + feature unlock + tenant/agency notifications. Implementing
 * `ShouldDispatchAfterCommit` keeps listeners safe when the approve flow
 * is wrapped in a DB transaction — they only fire once the row is
 * actually persisted.
 *
 * No listener consumes this event in TCK-268 itself.
 */
class AgencyUpgradeApproved implements ShouldDispatchAfterCommit
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly AgencyUpgradeRequest $upgradeRequest) {}
}
