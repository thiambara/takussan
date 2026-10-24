<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Controllers\Public\InvitationAcceptController;
use App\Http\Resources\InvitationResource;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Invitation\InvitationService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-249 — admin/agency-side invitation management.
 *
 * P208.01 (TCK-2190) — no generic creation: an invitation is issued by the
 * per-role routes (`agencies/{agency}/owners|agents|service-providers/invite`)
 * or by the super-admin cooptation (`admin/super-admins/invite`), each of which
 * creates or checks the targeted profile itself. The generic `store` let the
 * client pick `invitable_id` and `role` freely.
 *
 * The public accept route lives in {@see InvitationAcceptController}
 * because it must NOT require `auth:sanctum`.
 */
class InvitationController extends Controller
{
    public function __construct(private readonly InvitationService $service) {}

    /**
     * GET /api/invitations
     *
     * Visibility:
     *  - super_admin: every invitation across tenants.
     *  - `team.invite` in the active agency (admin included, TCK-1748):
     *    every invitation in their agency.
     *  - everyone else: only invitations they emitted (so per-role wizards
     *    can show "your pending invites").
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        $base = $this->visibleScope($user);
        $paginator = Invitation::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate($this->tailleDePage($request, 20));

        return $this->paginated($paginator, InvitationResource::collection($paginator)->toArray($request));
    }

    /**
     * GET /api/invitations/{invitation}
     */
    public function show(Request $request, Invitation $invitation): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('view', $invitation)) {
            throw new AuthorizationException(__('invitations.errors.cannot_view'));
        }

        return $this->json([
            'data' => InvitationResource::make($invitation)->resolve($request),
        ]);
    }

    /**
     * POST /api/invitations/{invitation}/revoke
     */
    public function revoke(Request $request, Invitation $invitation): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('revoke', $invitation)) {
            throw new AuthorizationException(__('invitations.errors.cannot_revoke'));
        }

        $invitation = $this->service->revoke($invitation, $user);

        return $this->json([
            'data' => InvitationResource::make($invitation)->resolve($request),
        ]);
    }

    /**
     * POST /api/invitations/{invitation}/resend
     */
    public function resend(Request $request, Invitation $invitation): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('resend', $invitation)) {
            throw new AuthorizationException(__('invitations.errors.cannot_resend'));
        }

        $invitation = $this->service->resend($invitation, $user);

        return $this->json([
            'data' => InvitationResource::make($invitation)->resolve($request),
        ]);
    }

    /**
     * Build the base query that respects per-role visibility. Kept as a
     * Builder so spatie's QueryBuilder can pile its filters/sorts/includes
     * on top.
     */
    protected function visibleScope(User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return Invitation::query();
        }

        // TCK-1748 (P116.03) — la portée suit la règle de la policy : `team.invite`, admin compris.
        if ($user->can('viewAny', Invitation::class)) {
            return Invitation::query()->where('agency_id', $user->staffAgencyId());
        }

        return Invitation::query()->where('invited_by', $user->id);
    }
}
