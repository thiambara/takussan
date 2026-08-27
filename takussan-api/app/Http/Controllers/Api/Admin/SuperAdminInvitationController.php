<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Admin\InviteSuperAdminRequest;
use App\Http\Resources\InvitationResource;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Services\Auth\SuperAdminCooptationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-264 — Super-admin cooptation surface.
 *
 * Mounted under `/api/admin/super-admins` behind `auth:sanctum` +
 * `super-admin` middleware. Lists active super-admins + pending
 * invitations, and exposes the `invite` endpoint that fans out to
 * {@see SuperAdminCooptationService}.
 */
class SuperAdminInvitationController extends Controller
{
    public function __construct(private readonly SuperAdminCooptationService $cooptation) {}

    /**
     * GET /api/admin/super-admins
     *
     * Returns two parallel collections:
     *  - `super_admins`: every user holding the global super_admin role
     *    plus their `force_2fa_at_first_login` flag (so the UI can
     *    surface "active" vs "awaiting 2FA" states).
     *  - `pending_invitations`: every invitation with role=super_admin
     *    still in `sent` or `expired` status (TCK-367).
     */
    public function index(Request $request): JsonResponse
    {
        $admins = $this->cooptation->superAdmins()
            ->map(fn ($user) => [
                'id' => $user->id,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'status' => $user->status?->value ?? (string) $user->status,
                'two_factor_enabled' => (bool) $user->two_factor_enabled,
                'force_2fa_at_first_login' => (bool) $user->force_2fa_at_first_login,
                'last_login_at' => $user->last_login_at?->toIso8601String(),
                'created_at' => $user->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        // TCK-367 — les `expired` rejoignent la liste : une invitation
        // morte doit se VOIR (et se relancer), pas disparaître de l'écran
        // en laissant croire qu'elle n'a jamais existé. Le champ
        // `is_expired` de la ressource distingue les deux états, y compris
        // pour une ligne encore `sent` que le cron horaire n'a pas encore
        // marquée.
        $pending = Invitation::query()
            ->where('role', 'super_admin')
            ->whereIn('status', [
                InvitationStatus::Sent->value,
                InvitationStatus::Expired->value,
            ])
            ->orderByDesc('created_at')
            ->get();

        return $this->json([
            'data' => [
                'super_admins' => $admins,
                'pending_invitations' => InvitationResource::collection($pending)->toArray($request),
            ],
        ]);
    }

    /**
     * POST /api/admin/super-admins/invite
     */
    public function store(InviteSuperAdminRequest $request): JsonResponse
    {
        $invitation = $this->cooptation->invite(
            inviter: $request->user(),
            data: $request->validated(),
        );

        return $this->json(
            ['data' => InvitationResource::make($invitation)->toArray($request)],
            201,
        );
    }

    /**
     * POST /api/admin/super-admins/invitations/{invitation}/resend
     *
     * TCK-367 — relance. Réémet l'invitation EXISTANTE : nouveau token,
     * expiration repoussée, aucune seconde ligne en base.
     */
    public function resend(Request $request, Invitation $invitation): JsonResponse
    {
        $invitation = $this->cooptation->resendInvitation($request->user(), $invitation);

        return $this->json([
            'data' => InvitationResource::make($invitation)->toArray($request),
        ]);
    }

    /**
     * POST /api/admin/super-admins/invitations/{invitation}/revoke
     *
     * TCK-367 — annulation. Idempotente (revoke d'une ligne déjà révoquée
     * est un no-op côté service), 422 sur une invitation déjà acceptée.
     */
    public function revoke(Request $request, Invitation $invitation): JsonResponse
    {
        $invitation = $this->cooptation->revokeInvitation($request->user(), $invitation);

        return $this->json([
            'data' => InvitationResource::make($invitation)->toArray($request),
        ]);
    }
}
