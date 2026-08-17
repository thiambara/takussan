<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Controllers\Public\InvitationAcceptController;
use App\Http\Requests\Invitation\CreateInvitationRequest;
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
     *  - admin / agency_admin: every invitation in their agency.
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
            ->paginate((int) $request->input('per_page', 20));

        return $this->paginated($paginator, InvitationResource::collection($paginator)->toArray($request));
    }

    /**
     * POST /api/invitations
     */
    public function store(CreateInvitationRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        // Authorize via the policy. Super_admin short-circuits via the
        // global Gate::before bypass.
        if (! $user->can('create', Invitation::class)) {
            throw new AuthorizationException(__('invitations.errors.cannot_create'));
        }

        $data = $request->validated();

        // Non-super_admin actors are constrained to invite within their
        // own agency. Force-set / cross-check `agency_id` against the
        // active profile so a malicious payload can't trick us into
        // issuing cross-tenant invitations.
        if (! $user->isSuperAdmin()) {
            $activeAgencyId = $request->activeProfile()?->agency_id ?? $user->agency_id;
            if (! isset($data['agency_id'])) {
                $data['agency_id'] = $activeAgencyId;
            } elseif ((int) $data['agency_id'] !== (int) $activeAgencyId) {
                throw new AuthorizationException(__('invitations.errors.cross_agency'));
            }
        }

        $invitation = $this->service->send($data, $user);

        return $this->json(
            ['data' => InvitationResource::make($invitation)->toArray($request)],
            201,
        );
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
            'data' => InvitationResource::make($invitation)->toArray($request),
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
            'data' => InvitationResource::make($invitation)->toArray($request),
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
            'data' => InvitationResource::make($invitation)->toArray($request),
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

        if ($user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id)) {
            return Invitation::query()->where('agency_id', $user->agency_id);
        }

        return Invitation::query()->where('invited_by', $user->id);
    }
}
