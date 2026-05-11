<?php

namespace App\Listeners\Agency;

use App\Events\AgencyUpgradeApproved;
use App\Models\Enums\AgencyKind;
use App\Services\Agency\AgencyKindFlipService;
use App\Services\Agency\AgencyUpgradeReviewService;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-269 — Safety-net listener for {@see AgencyUpgradeApproved}.
 *
 * The HTTP/console approve flow ({@see AgencyUpgradeReviewService::approve()})
 * already calls {@see AgencyKindFlipService::flip()} in the same DB
 * transaction so the flip is rollback-coupled to the approval (Option A
 * in the TCK-269 implementation notes).
 *
 * This listener stays registered as a safety net for callers that
 * dispatch the event directly (jobs, ad-hoc scripts, future entry
 * points). It is deliberately a no-op when the agency is already
 * `standard` — the event ships `ShouldDispatchAfterCommit` so on the
 * happy path the flip is durable before we even fire.
 */
class FlipAgencyKindOnUpgradeApproved
{
    public function __construct(private readonly AgencyKindFlipService $service) {}

    public function handle(AgencyUpgradeApproved $event): void
    {
        $request = $event->upgradeRequest->fresh() ?? $event->upgradeRequest;
        $agency = $request->agency;

        if ($agency === null) {
            // Agency was deleted between approval and listener — log and
            // bail; we never want to crash the queue worker.
            Log::warning('FlipAgencyKindOnUpgradeApproved: agency missing', [
                'upgrade_request_id' => $request->id,
            ]);

            return;
        }

        if ($agency->kind === AgencyKind::Standard) {
            // Already flipped (Option A — the approve service did it inline).
            // Stay silent: this is the expected hot path.
            return;
        }

        try {
            $this->service->flip($request);
        } catch (Throwable $e) {
            // Direct dispatch path failed — surface for observability but
            // don't kill the worker; the activity log will be missing the
            // entry and operators can re-run the flip manually.
            Log::error('FlipAgencyKindOnUpgradeApproved: flip failed', [
                'upgrade_request_id' => $request->id,
                'agency_id' => $agency->id,
                'exception' => $e->getMessage(),
            ]);

            throw $e;
        }
    }
}
