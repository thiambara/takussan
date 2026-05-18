<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Invitation\InviteOwnerRequest;
use App\Http\Resources\InvitationResource;
use App\Models\Agency;
use App\Models\Profiles\OwnerProfile;
use App\Services\Invitation\OwnerInvitationService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;

/**
 * TCK-256 — `POST /api/agencies/{agency}/owners/invite`.
 *
 * Thin controller — all business rules live in
 * {@see OwnerInvitationService}. The policy gate runs before the
 * service so we surface 403 before incurring DB writes.
 */
class OwnerInvitationController extends Controller
{
    public function __construct(private readonly OwnerInvitationService $service) {}

    public function __invoke(InviteOwnerRequest $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('invite', [OwnerProfile::class, $agency])) {
            throw new AuthorizationException(__('owners.invite.errors.permission_denied'));
        }

        $invitation = $this->service->invite($agency, $user, $request->validated());

        return $this->json(
            ['data' => InvitationResource::make($invitation)->toArray($request)],
            201,
        );
    }
}
