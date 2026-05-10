<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreWelcomeViewRequest;
use App\Models\Lease;
use App\Models\TenantOnboardingChecklist;
use App\Models\WelcomeView;
use App\Services\Tenant\TenantOnboardingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-251 — Tracks one-shot welcome modales.
 *
 * Frontend modales call `POST /api/me/welcome-seen` once the user has
 * dismissed (skip) or completed (last slide) the flow. They consult
 * `GET /api/me/welcome-seen` on mount to decide whether to render at
 * all. `key` is owned by each consumer modale — see `WelcomeView` and
 * the `useWelcomeOnce` hook on the frontend.
 */
class WelcomeViewController extends Controller
{
    /**
     * GET /api/me/welcome-seen — returns the keys the current user has
     * already acknowledged.
     */
    public function index(Request $request): JsonResponse
    {
        $keys = WelcomeView::query()
            ->where('user_id', $request->user()->id)
            ->orderBy('key')
            ->pluck('key')
            ->all();

        return $this->json(['data' => $keys]);
    }

    /**
     * POST /api/me/welcome-seen — marks a key as seen for the current
     * user. Idempotent: replaying with the same key is a no-op thanks
     * to the unique `(user_id, key)` index.
     */
    public function store(StoreWelcomeViewRequest $request, TenantOnboardingService $onboarding): JsonResponse
    {
        $key = $request->string('key')->toString();
        $userId = $request->user()->id;

        $view = WelcomeView::firstOrCreate(
            [
                'user_id' => $userId,
                'key' => $key,
            ],
            [
                'seen_at' => now(),
            ],
        );

        // TCK-266 — When the dismissed key matches `tenant-welcome-{lease_id}`,
        // bridge into the onboarding checklist so the "welcome seen" item is
        // automatically ticked. Done here (in the controller) rather than via
        // an event listener: the welcome key is the only signal that the
        // tenant actually dismissed the modal — emitting an event from the
        // model would conflate creation with the user-driven dismissal.
        if ($view->wasRecentlyCreated && preg_match('/^tenant-welcome-(\d+)$/', $key, $m) === 1) {
            $leaseId = (int) $m[1];
            $lease = Lease::query()->find($leaseId);
            // Authorization: only the actual tenant of the lease can mark
            // their own checklist via this side-channel.
            if ($lease !== null && $lease->tenant?->user_id === $userId) {
                $checklist = TenantOnboardingChecklist::query()
                    ->where('lease_id', $leaseId)
                    ->first();
                if ($checklist !== null) {
                    $onboarding->markItem($checklist, TenantOnboardingChecklist::ITEM_WELCOME_SEEN);
                }
            }
        }

        return $this->json(['data' => $view], $view->wasRecentlyCreated ? 201 : 200);
    }
}
