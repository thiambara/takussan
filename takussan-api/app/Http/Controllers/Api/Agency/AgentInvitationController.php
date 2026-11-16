<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Invitation\InviteAgentRequest;
use App\Http\Resources\InvitationResource;
use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Services\Invitation\AgentInvitationService;
use App\Services\Invitation\InvitationService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;

/**
 * TCK-258 — `POST /api/agencies/{agency}/agents/invite`.
 *
 * TCK-2927 (ADR-0123) — `delivery: "share"` : rien ne part, la réponse porte `share_url`.
 *
 * Thin controller — all business rules live in
 * {@see AgentInvitationService}. The policy gate runs before the
 * service so we surface 403 before incurring DB writes.
 */
class AgentInvitationController extends Controller
{
    public function __construct(private readonly AgentInvitationService $service) {}

    public function __invoke(InviteAgentRequest $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('invite', [AgentProfile::class, $agency])) {
            throw new AuthorizationException(__('team.invite.errors.permission_denied'));
        }

        $invitation = $this->service->invite($agency, $user, $request->validated());

        // TCK-2927 (ADR-0123 § 1) — une invitation partagée n'est pas partie : CETTE réponse seule
        // rend le lien à l'invitant (jamais `InvitationResource`, jamais une lecture), en `no-store`.
        if ($invitation->estPartagee()) {
            return $this->json([
                'data' => [
                    ...InvitationResource::make($invitation)->resolve($request),
                    'share_url' => InvitationService::shareUrl($invitation->token),
                ],
            ], 201, ['Cache-Control' => 'no-store, private']);
        }

        return $this->json(
            ['data' => InvitationResource::make($invitation)->resolve($request)],
            201,
        );
    }
}
