<?php

namespace App\Http\Controllers\Public;

use App\Exceptions\ApiError;
use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PublicInvitationPreviewResource;
use App\Models\Invitation;
use App\Services\Invitation\InvitationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2609 (ADR-0094 §1-3) — `GET /api/public/invitations/{token}` : l'aperçu d'une invitation par son
 * jeton, sans compte. L'état du jeton est celui de l'acceptation
 * (`InvitationService::lookupActiveInvitation`) : 404 `invitation.token_not_found` sans aucune donnée ;
 * 410 `token_expired` / `token_revoked` / `token_accepted` complété de l'agence et de la date.
 *
 * Lecture seule : ni statut, ni « vu le », ni journal — le lien ouvert dans un aperçu de messagerie
 * ne doit rien changer. Borné par IP (`throttle:public-invitation-preview`).
 */
class PublicInvitationPreviewController extends Controller
{
    public function __construct(private readonly InvitationService $invitations) {}

    public function __invoke(Request $request, string $token): JsonResponse
    {
        try {
            $invitation = $this->invitations->lookupActiveInvitation($token);
        } catch (ApiError $e) {
            $closed = $e->getStatusCode() === 410
                ? Invitation::query()->where('token', $token)->first()
                : null;

            throw $closed === null ? $e : $e->with((new PublicInvitationPreviewResource($closed))->closed());
        }

        $invitation->load(['agency.addresses', 'inviter']);

        return $this->json(['data' => (new PublicInvitationPreviewResource($invitation))->toArray($request)]);
    }
}
