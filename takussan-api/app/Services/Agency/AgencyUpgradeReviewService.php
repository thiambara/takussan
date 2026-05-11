<?php

namespace App\Services\Agency;

use App\Events\AgencyUpgradeApproved;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\User;
use App\Notifications\AgencyUpgradeApprovedNotification;
use App\Notifications\AgencyUpgradeRejectedNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

/**
 * TCK-268 — super-admin side of the `individual → standard` upgrade flow.
 *
 * Decisions are terminal: a request that already moved out of `pending`
 * cannot be re-decided (the form-request returns 422 long before we
 * reach this layer for HTTP callers, but the service re-checks for
 * direct callers / queue jobs).
 *
 * Side effects per decision:
 *  - approve → activity log `agency_upgrade_approved`, dispatch
 *    {@see AgencyUpgradeApproved} (consumed by TCK-269 to flip the
 *    Agency.kind), notify submitter via
 *    {@see AgencyUpgradeApprovedNotification}.
 *  - reject  → activity log `agency_upgrade_rejected`, notify submitter
 *    via {@see AgencyUpgradeRejectedNotification} with the motif.
 *
 * The actual `Agency.kind` flip + tenant/agency post-flip notifications
 * live in TCK-269 — this service only records the decision and signals it.
 */
class AgencyUpgradeReviewService
{
    public function __construct(
        private readonly AgencyKindFlipService $kindFlipService,
    ) {}

    public function approve(
        AgencyUpgradeRequest $request,
        User $reviewer,
        ?string $comment = null,
    ): AgencyUpgradeRequest {
        $this->assertPending($request);

        // TCK-269 — Option A: the actual `Agency.kind = standard` flip is
        // executed inline within the same DB transaction as the approval,
        // so any failure (DB constraint, missing agency, partial metadata
        // write, etc.) rolls the approval back to `pending`. The
        // `AgencyUpgradeApproved` event is still dispatched (after-commit)
        // so out-of-band consumers can react, but the safety-net listener
        // is a no-op on the happy path because the agency is already
        // standard by the time it fires.
        $approved = DB::transaction(function () use ($request, $reviewer, $comment): AgencyUpgradeRequest {
            $request->update([
                'status' => AgencyUpgradeRequestStatus::Approved->value,
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
                'review_comment' => $comment !== null ? trim($comment) : null,
            ]);

            activity('AgencyUpgradeRequest')
                ->performedOn($request)
                ->causedBy($reviewer)
                ->withProperties([
                    'agency_id' => $request->agency_id,
                    'reviewed_by' => $reviewer->id,
                ])
                ->event('agency_upgrade_approved')
                ->log('agency_upgrade_approved');

            try {
                // Refresh once so the flip service sees the freshly-set
                // `reviewed_by` (used as the activity log causer).
                $this->kindFlipService->flip($request->fresh() ?? $request);
            } catch (Throwable $e) {
                // Surface as 500 so the surrounding transaction rolls back
                // and the request remains `pending` — operators can retry.
                throw $e;
            }

            // ShouldDispatchAfterCommit on the event keeps TCK-269's
            // listener safe — it only fires once the row is persisted.
            AgencyUpgradeApproved::dispatch($request);

            return $request;
        });

        $this->notifySubmitter($approved, new AgencyUpgradeApprovedNotification($approved));

        return $approved->fresh() ?? $approved;
    }

    public function reject(
        AgencyUpgradeRequest $request,
        User $reviewer,
        string $comment,
    ): AgencyUpgradeRequest {
        $this->assertPending($request);

        $trimmed = trim($comment);
        if ($trimmed === '' || mb_strlen($trimmed) < 5) {
            // Guards direct callers — HTTP validation already enforces this
            // via RejectAgencyUpgradeRequest, but services must not trust
            // upstream callers to have done the right thing.
            throw ValidationException::withMessages([
                'comment' => [__('agency_upgrade.review.errors.comment_required')],
            ]);
        }

        $rejected = DB::transaction(function () use ($request, $reviewer, $trimmed): AgencyUpgradeRequest {
            $request->update([
                'status' => AgencyUpgradeRequestStatus::Rejected->value,
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
                'review_comment' => $trimmed,
            ]);

            activity('AgencyUpgradeRequest')
                ->performedOn($request)
                ->causedBy($reviewer)
                ->withProperties([
                    'agency_id' => $request->agency_id,
                    'reviewed_by' => $reviewer->id,
                ])
                ->event('agency_upgrade_rejected')
                ->log('agency_upgrade_rejected');

            return $request;
        });

        $this->notifySubmitter($rejected, new AgencyUpgradeRejectedNotification($rejected));

        return $rejected->fresh() ?? $rejected;
    }

    /**
     * Throws 422 unless the request is still pending. Centralised so the
     * approve / reject paths share the same error surface.
     */
    protected function assertPending(AgencyUpgradeRequest $request): void
    {
        $status = $request->status instanceof AgencyUpgradeRequestStatus
            ? $request->status
            : AgencyUpgradeRequestStatus::tryFrom((string) $request->status);

        if ($status !== AgencyUpgradeRequestStatus::Pending) {
            throw new HttpException(422, __('agency_upgrade.review.errors.not_pending'));
        }
    }

    /**
     * Notifies the original submitter — silently no-ops if the user was
     * deleted between submission and review. We never block the decision
     * on the notification side-effect.
     */
    protected function notifySubmitter(AgencyUpgradeRequest $request, mixed $notification): void
    {
        $submitter = $request->submitter;
        if ($submitter === null) {
            return;
        }

        Notification::send($submitter, $notification);
    }
}
