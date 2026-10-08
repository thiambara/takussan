<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\SuspendTeamMemberRequest;
use App\Models\Agency;
use App\Models\User;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Http\JsonResponse;

/**
 * TCK-587 (ADR-0031 §2) — `POST /api/agencies/{agency}/team/{user}/suspend` et `/reactivate`.
 *
 * La suspension vit dans l'agence ; bloquer le COMPTE (`/api/users/{id}/block`) est redevenu un
 * geste du super-admin seul.
 */
class TeamMemberSuspensionController extends Controller
{
    public function __construct(private readonly TeamMemberSuspensionService $service) {}

    public function suspend(SuspendTeamMemberRequest $request, Agency $agency, User $user): JsonResponse
    {
        return $this->json(['data' => $this->service->suspend($agency, $user, $request->user())]);
    }

    public function reactivate(SuspendTeamMemberRequest $request, Agency $agency, User $user): JsonResponse
    {
        return $this->json(['data' => $this->service->reactivate($agency, $user, $request->user())]);
    }
}
