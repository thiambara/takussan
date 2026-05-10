<?php

namespace App\Events\Lease;

use App\Models\Lease;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-265 — Fired right after `LeaseService::activate()` flips a lease
 * from `Draft` to `Active`. Carries only the freshly-activated lease so
 * downstream listeners (welcome notification, audit log, future tenant
 * onboarding hooks) can derive what they need.
 *
 * `ShouldDispatchAfterCommit` defers the dispatch until the surrounding
 * DB transaction (if any) has committed — so listeners always see the
 * updated `status = active` / `signed_at` columns and never race a
 * `dispatch()` against a still-uncommitted row.
 */
class LeaseActivated implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public function __construct(public Lease $lease) {}
}
