<?php

namespace App\Events\Lease;

use App\Models\Lease;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-089 — Fired right after `LeaseRenewalService::renew` persists a
 * child lease and flips the parent to `Renewed`. Carries the diff so
 * downstream consumers (notifications, audit) don't re-derive it.
 */
class LeaseRenewed
{
    use Dispatchable, SerializesModels;

    /**
     * @param  array<string,array{from:mixed,to:mixed}>  $changes
     */
    public function __construct(
        public Lease $parent,
        public Lease $child,
        public array $changes = [],
    ) {}
}
