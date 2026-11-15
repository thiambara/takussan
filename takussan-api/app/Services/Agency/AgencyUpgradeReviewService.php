<?php

namespace App\Services\Agency;

use App\Events\AgencyUpgradeApproved;
use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\User;
use App\Notifications\AgencyUpgradeApprovedNotification;
use App\Notifications\AgencyUpgradeRejectedNotification;
use App\Services\Billing\AgencySubscriptionService;
use App\Services\Billing\UpgradeOffer;
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
 *    {@see AgencyUpgradeApprovedNotification} ; dans la même transaction, l'agence est abonnée
 *    au plan du passage (TCK-2681, {@see self::subscribeToUpgradePlan()}).
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
        private readonly UpgradeOffer $upgradeOffer,
        private readonly AgencySubscriptionService $subscriptions,
    ) {}

    public function approve(
        AgencyUpgradeRequest $request,
        User $reviewer,
        ?string $comment = null,
    ): AgencyUpgradeRequest {
        $this->assertPending($request);
        $this->assertKycVerified($request);

        // TCK-991 (P49.05) — une agence suspendue ne passe pas en `standard` : la demande reste
        // `pending`, approuvable une fois la suspension levée, ou rejetable. `inactive` reste
        // approuvable (ADR-0048 : la mise en conformité, que le passage peut servir).
        abort_code_if(
            $request->agency()->value('status') === AgencyStatus::Suspended,
            422,
            'agency.suspended',
        );

        // TCK-269 — Option A: the actual `Agency.kind = standard` flip is
        // executed inline within the same DB transaction as the approval,
        // so any failure (DB constraint, missing agency, partial metadata
        // write, etc.) rolls the approval back to `pending`. The
        // `AgencyUpgradeApproved` event is still dispatched (after-commit)
        // so out-of-band consumers can react, but the safety-net listener
        // is a no-op on the happy path because the agency is already
        // standard by the time it fires.
        $approved = DB::transaction(function () use ($request, $reviewer, $comment): AgencyUpgradeRequest {
            $request = $this->lockPending($request);
            // TCK-2730 — avant toute écriture, et avant la bascule de type : rien d'écrit à moitié.
            $this->assertNoNegotiatedOverrides($request);
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

            $this->subscribeToUpgradePlan($request, $reviewer);

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
            $request = $this->lockPending($request);
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
     * TCK-2681 (ADR-0104 § 6, décidé par le porteur le 2026-11-10) — l'approbation abonne l'agence
     * au plan que l'hôte a lu avant de demander (`GET /api/me/upgrade-offer`, même résolution :
     * {@see UpgradeOffer}). Sans essai ni dérogation, et sans prélèvement : l'abonnement est posé,
     * aucun paiement n'est déclenché. Dans la transaction de l'approbation : un plan introuvable ou
     * retiré fait tout échouer — la demande reste `pending`, l'agence `individual`. Un abonnement
     * ouvert (posé à la main avant) est clos par `assign()` comme tout changement de plan ; le
     * journal en garde les identifiants.
     */
    protected function subscribeToUpgradePlan(AgencyUpgradeRequest $request, User $reviewer): void
    {
        $plan = $this->upgradeOffer->plan();
        abort_code_unless($plan, 422, 'agency_upgrade.plan_unavailable');

        $agency = Agency::query()->whereKey($request->agency_id)->firstOrFail();
        $replaced = AgencySubscription::query()
            ->where('agency_id', $agency->id)
            ->whereNull('ended_at')
            ->orderBy('id')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $subscription = $this->subscriptions->assign($agency, $plan, $reviewer);

        activity('AgencyUpgradeRequest')
            ->performedOn($subscription)
            ->causedBy($reviewer)
            ->withProperties([
                'agency_id' => $agency->id,
                'plan_id' => $plan->id,
                'agency_upgrade_request_id' => $request->id,
                'replaced_subscription_ids' => $replaced,
            ])
            ->event('agency_upgrade_subscription_assigned')
            ->log('agency_upgrade_subscription_assigned');
    }

    /**
     * TCK-2730 (décision du porteur du 2026-11-11, option b, provisoire) — `assign()` clôt tout
     * abonnement ouvert, dérogations comprises, et le nouveau n'en porte aucune (« sans essai ni
     * dérogation », TCK-2681). Plutôt que de les faire disparaître en silence, l'approbation est
     * refusée tant que l'abonnement ouvert en porte une : `409 agency_upgrade.subscription_has_overrides`,
     * avec les dérogations dans `overrides`. Le super-admin les retire (TCK-2222), puis approuve.
     * Pas de report automatique : une dérogation de quota est une valeur ABSOLUE
     * (`QuotaResolver::effectiveLimits`), qui pourrait abaisser un quota du plan pro.
     *
     * Lu sous verrou, dans la transaction de l'approbation : une dérogation posée entre la lecture
     * et la clôture ne passe pas.
     */
    protected function assertNoNegotiatedOverrides(AgencyUpgradeRequest $request): void
    {
        $open = AgencySubscription::query()
            ->where('agency_id', $request->agency_id)
            ->whereNull('ended_at')
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        foreach ($open as $subscription) {
            $overrides = array_filter([
                'platform_fee_pct' => $subscription->platform_fee_pct_override !== null
                    ? (float) $subscription->platform_fee_pct_override
                    : null,
                'limits' => ($subscription->limits_override ?? []) !== [] ? $subscription->limits_override : null,
            ], fn ($value) => $value !== null);

            if ($overrides !== []) {
                throw (new ApiError(409, 'agency_upgrade.subscription_has_overrides'))->with(['overrides' => $overrides]);
            }
        }
    }

    /**
     * P211.02 (TCK-2107) — la demande relue sous verrou dans la transaction de la décision, et
     * `pending` jugé sur elle. Jugé sur le modèle lié seul, hors transaction, un rejet sur une copie
     * périmée passait après une approbation : demande `rejected`, agence déjà `standard`, et le
     * demandeur recevait les deux avis. Le contrôle d'avant la transaction reste : il garde l'ordre
     * des refus (`not_pending` avant le KYC et la suspension).
     */
    protected function lockPending(AgencyUpgradeRequest $request): AgencyUpgradeRequest
    {
        $locked = AgencyUpgradeRequest::query()->whereKey($request->getKey())->lockForUpdate()->firstOrFail();
        $this->assertPending($locked);

        return $locked;
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
     * TCK-1003 (P49.02) — la bascule fait de l'agence une `standard`, dont les reversements de la
     * plateforme exigent `is_verified` (`PlatformPayoutService::approve`, ADR-0039 § 5). La demande
     * ne porte pas les pièces du dossier KYC (`KycWorkflowService::AGENCY_REQUIRED_DOCUMENTS`) :
     * l'approbation exige donc un dossier KYC vérifié, sans quoi l'argent déjà clôturé gèlerait.
     * Avant toute écriture : la demande reste `pending`.
     */
    protected function assertKycVerified(AgencyUpgradeRequest $request): void
    {
        abort_code_unless(
            $request->agency?->kycDossier?->status === KycDossierStatus::Verified,
            422,
            'agency_upgrade.kyc_not_verified',
        );
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
