<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Agency\StoreAgentHandoverRequest;
use App\Models\Agency;
use App\Models\User;
use App\Services\Agency\AgentHandoverService;
use App\Services\Agency\AgentPortfolio;
use Illuminate\Http\JsonResponse;

/**
 * TCK-591 §8 — le portefeuille d'un membre qui part, et sa passation. Autorisés par `team.remove`
 * dans l'agence de la route : c'est le geste qui précède le retrait.
 */
class AgentHandoverController extends Controller
{
    public function __construct(private readonly AgentHandoverService $handover) {}

    public function show(Agency $agency, User $user): JsonResponse
    {
        $this->authorize('removeMember', $agency);
        $this->refuseNonStaff($agency, $user);

        return $this->json(['data' => [
            'user_id' => $user->id,
            'portfolio' => $this->handover->inventory($agency, $user),
            'transferable' => AgentPortfolio::TRANSFERABLE,
            // Comptées, non transmises : aucune depuis TCK-603 ; la clé reste pour l'assistant.
            'pending' => AgentPortfolio::PENDING,
        ]]);
    }

    public function store(StoreAgentHandoverRequest $request, Agency $agency, User $user): JsonResponse
    {
        $this->refuseNonStaff($agency, $user);

        $result = $this->handover->transfer(
            $agency,
            $user,
            $request->successorsByCategory(),
            $request->user(),
            removeAfter: $request->boolean('remove_after'),
            leaveUnassigned: $request->boolean('leave_unassigned'),
        );

        return $this->json(['data' => [
            'user_id' => $user->id,
            'moved' => array_map('count', $result['moved']),
            'unassigned' => array_map('count', $result['unassigned']),
            'removed' => $result['removed_profiles'] !== null,
            'portfolio' => $this->handover->inventory($agency, $user),
        ]]);
    }

    /**
     * TCK-591 (verif-591 M2) — on ne fait la passation que d'un membre de l'ÉQUIPE : un profil agent
     * ou admin d'agence dans l'agence, de tout statut (un agent suspendu se passe aussi). Même test
     * que le retrait (`AgencyMemberRemovalService`). La passation d'un bailleur transmettait sa
     * co-propriété à un agent.
     */
    private function refuseNonStaff(Agency $agency, User $user): void
    {
        $agencyId = (int) $agency->id;
        if ($user->agentProfiles()->where('agency_id', $agencyId)->exists()
            || $user->agencyAdminProfiles()->where('agency_id', $agencyId)->exists()) {
            return;
        }

        abort_code(422, 'agent_handover.member_not_staff');
    }
}
