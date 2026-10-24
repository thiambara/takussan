<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\RequestAccountDeletionRequest;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use App\Services\Account\DeletionStepUpService;
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
                'requested_at' => $this->instant($deletionRequest->requested_at),
                'scheduled_for' => $this->instant($deletionRequest->scheduled_for),
                'reason' => $deletionRequest->reason,
                'reason_code' => $deletionRequest->reason_code,
                'days_remaining' => $deletionRequest->daysRemaining(),
                'executed_at' => $this->instant($deletionRequest->executed_at),
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
            $request->stepUpMode(),
        );

        return $this->json([
            'data' => [
                'id' => $deletionRequest->id,
                'requested_at' => $this->instant($deletionRequest->requested_at),
                'scheduled_for' => $this->instant($deletionRequest->scheduled_for),
                'days_remaining' => $deletionRequest->daysRemaining(),
            ],
        ], 202);
    }

    /**
     * POST /api/auth/me/deletion-request/step-up
     *
     * TCK-272 — émet le code à 6 chiffres qui remplace le mot de passe pour
     * les comptes dont le hash en base est une valeur machine. Le backend
     * est seul arbitre du mode : un compte QUI A un mot de passe utilisable
     * se voit refuser cette voie (422), on n'ouvre pas une seconde porte,
     * plus faible, à des comptes qui n'en ont pas besoin.
     *
     * Réponse invariante en 202 dès lors que la voie est la bonne — y
     * compris quand le cooldown de renvoi court encore : le temps de
     * réponse ne doit rien apprendre à un porteur de jeton volé.
     */
    public function sendStepUpCode(Request $request, DeletionStepUpService $stepUp): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->hasUsablePassword()) {
            return $this->json([
                'message' => __('account.deletion.errors.step_up_not_applicable'),
            ], 422);
        }

        $stepUp->sendCode($user);

        return $this->json([
            'message' => __('account.deletion.step_up.code_sent'),
            'expires_in_seconds' => DeletionStepUpService::CODE_TTL_SECONDS,
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
