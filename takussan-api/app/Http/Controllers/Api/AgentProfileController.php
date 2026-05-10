<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Profiles\AgentProfile;
use App\Services\Invitation\AgentInvitationService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-258 — endpoints for managing existing agent profiles:
 *
 *  - `PATCH /api/profiles/{agent_profile}/suspend` — flips status to
 *    `suspended` (or back to `active` when body sends `{active: true}`).
 *  - `DELETE /api/profiles/{agent_profile}` — soft delete; the
 *    historique reste consultable.
 *
 * Authorization is policy-driven and requires `manage_team` in the
 * profile's agency context (via {@see AgentProfilePolicy}).
 */
class AgentProfileController extends Controller
{
    public function __construct(private readonly AgentInvitationService $service) {}

    public function suspend(Request $request, AgentProfile $agentProfile): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('suspend', $agentProfile)) {
            throw new AuthorizationException(__('team.errors.forbidden'));
        }

        $active = (bool) $request->input('active', false);
        $profile = $this->service->suspend($agentProfile, $user, $active);

        return $this->json(['data' => $profile->toArray()]);
    }

    public function destroy(Request $request, AgentProfile $agentProfile): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('delete', $agentProfile)) {
            throw new AuthorizationException(__('team.errors.forbidden'));
        }

        $this->service->remove($agentProfile, $user);

        return $this->json(null, 204);
    }
}
