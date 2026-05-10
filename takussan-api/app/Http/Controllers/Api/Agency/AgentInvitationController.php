<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Invitation\InviteAgentRequest;
use App\Http\Resources\InvitationResource;
use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Services\Invitation\AgentInvitationService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;

/**
 * TCK-258 — `POST /api/agencies/{agency}/agents/invite`.
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

        return $this->json(
            ['data' => InvitationResource::make($invitation)->toArray($request)],
            201,
        );
    }
}
