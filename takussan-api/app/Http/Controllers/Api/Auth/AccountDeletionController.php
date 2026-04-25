<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\RequestAccountDeletionRequest;
use App\Services\Account\AccountDeletionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-080 — self-service RGPD account deletion endpoints. Strictly
 * scoped to the authenticated user — admin deletion runs through a
 * separate, audited path (out of scope of this ticket).
 */
class AccountDeletionController extends Controller
{
    public function __construct(private readonly AccountDeletionService $service) {}

    /**
     * GET /api/auth/me/deletion-request
     */
    public function show(Request $request): JsonResponse
    {
        $deletionRequest = $request->user()->deletionRequest()->first();

        if ($deletionRequest === null) {
            return $this->json(['data' => null]);
        }

        return $this->json([
            'data' => [
                'id' => $deletionRequest->id,
                'requested_at' => $deletionRequest->requested_at?->toIso8601String(),
                'scheduled_for' => $deletionRequest->scheduled_for?->toIso8601String(),
                'reason' => $deletionRequest->reason,
                'reason_code' => $deletionRequest->reason_code,
                'days_remaining' => $deletionRequest->daysRemaining(),
                'executed_at' => $deletionRequest->executed_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * POST /api/auth/me/deletion-request
     *
     * 202 + scheduled_for on success, 422 + obligations[] when the user
     * has open leases / payments / bookings.
     */
    public function store(RequestAccountDeletionRequest $request): JsonResponse
    {
        $deletionRequest = $this->service->requestDeletion(
            $request->user(),
            $request->input('reason'),
            $request->input('reason_code'),
        );

        return $this->json([
            'data' => [
                'id' => $deletionRequest->id,
                'requested_at' => $deletionRequest->requested_at?->toIso8601String(),
                'scheduled_for' => $deletionRequest->scheduled_for?->toIso8601String(),
                'days_remaining' => $deletionRequest->daysRemaining(),
            ],
        ], 202);
    }

    /**
     * DELETE /api/auth/me/deletion-request
     */
    public function destroy(Request $request): JsonResponse
    {
        $cancelled = $this->service->cancelDeletion($request->user());

        if (! $cancelled) {
            return $this->json(['message' => __('account.deletion.errors.no_pending_request')], 404);
        }

        return $this->json(null, 204);
    }
}
