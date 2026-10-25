<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\UpdateAgentCommissionRateRequest;
use App\Http\Resources\AgentProfileResource;
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
 *  - `PATCH /api/profiles/{agent_profile}/commission-rate` — le taux de commission de l'agent
 *    (TCK-2364, P241.02), sous `team.assign_role`.
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

        // TCK-1500 (P94.04) — `hire_date` et `active_until` sont castés `date` : `Y-m-d` (ADR-0018).
        // TCK-2045 (P61.04) — par la ressource : `toArray()` rendait `metadata` entier, KYC compris.
        return $this->json(['data' => (new AgentProfileResource($profile))->resolve($request)]);
    }

    /**
     * TCK-2364 (P241.02) — le taux de commission de l'agent, posé sur sa fiche de membre. L'autorisation
     * et la validation courent dans {@see UpdateAgentCommissionRateRequest}.
     */
    public function updateCommissionRate(UpdateAgentCommissionRateRequest $request, AgentProfile $agentProfile): JsonResponse
    {
        $agentProfile->update(['commission_rate' => $request->validated('commission_rate')]);

        return $this->json(['data' => (new AgentProfileResource($agentProfile->refresh()))->resolve($request)]);
    }

    public function destroy(Request $request, AgentProfile $agentProfile): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('delete', $agentProfile)) {
            throw new AuthorizationException(__('team.errors.forbidden'));
        }

        $this->service->remove($agentProfile, $user, $request->boolean('leave_unassigned'));

        return $this->json(null, 204);
    }
}
