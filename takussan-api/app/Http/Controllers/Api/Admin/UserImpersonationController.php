<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Admin\StartImpersonationRequest;
use App\Models\Enums\ImpersonationEndReason;
use App\Models\ImpersonationSession;
use App\Models\User;
use App\Services\Admin\ImpersonationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * TCK-600 (ADR-0055) — l'impersonation : une session de LECTURE de 15 minutes.
 *
 * `start` garde son nom d'action : la liste step-up de TCK-589 l'apparie par action. Sa réponse
 * porte le jeton et n'est destinée qu'au route handler du BFF, qui le range dans un cookie httpOnly ;
 * le navigateur ne le reçoit jamais. `stop` ferme la session ouverte DE L'APPELANT — plus de
 * `user_id` libre. `current` sert la bannière, appelé avec le jeton d'impersonation.
 */
class UserImpersonationController extends Controller
{
    public function __construct(
        private readonly ImpersonationService $impersonation,
    ) {}

    public function start(StartImpersonationRequest $request, User $user): JsonResponse
    {
        ['session' => $session, 'token' => $token] = $this->impersonation->start(
            $request->user(),
            $user,
            (string) $request->validated('reason'),
        );

        return $this->json(['data' => [
            'session_id' => $session->id,
            'token' => $token,
            'expires_at' => $session->expires_at->toIso8601String(),
            'target' => ['id' => $user->id, 'name' => $user->full_name],
        ]], 201);
    }

    public function stop(Request $request): JsonResponse
    {
        $session = ImpersonationSession::query()
            ->where('impersonator_id', $request->user()->id)
            ->whereNull('ended_at')
            ->latest('started_at')
            ->first();
        abort_code_if($session === null, 404, 'impersonation.no_session');

        $this->impersonation->stop($session, ImpersonationEndReason::Stopped);
        $session->refresh();

        return $this->json(['data' => [
            'session_id' => $session->id,
            'ended_at' => $session->ended_at?->toIso8601String(),
        ]]);
    }

    public function current(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();
        $session = $token instanceof PersonalAccessToken && ImpersonationService::isImpersonationToken($token)
            ? $this->impersonation->openSessionForToken($token)
            : null;
        abort_code_if($session === null, 404, 'impersonation.no_session');

        $operateur = $session->impersonator;
        $cible = $session->target;

        return $this->json(['data' => [
            'session_id' => $session->id,
            'impersonator' => ['id' => $operateur?->id, 'name' => $operateur?->full_name],
            'target' => ['id' => $cible?->id, 'name' => $cible?->full_name],
            'expires_at' => $session->expires_at->toIso8601String(),
            'read_only' => true,
        ]]);
    }
}
