<?php

namespace App\Http\Controllers\Public;

use App\Exceptions\ApiError;
use App\Http\Controllers\Base\Controller;
use App\Models\Invitation;
use App\Services\Invitation\InvitationRenewalRequests;
use App\Services\Invitation\InvitationService;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2609 (ADR-0094 §3) — `POST /api/public/invitations/{token}/renewal-request` : l'invité dont le
 * lien a EXPIRÉ demande un nouveau lien, sans compte.
 *
 * Seul un jeton expiré l'ouvre : un jeton inconnu rend 404, un jeton révoqué ou accepté son 410 (le
 * même état que l'acceptation), un jeton encore valable 410 `invitation.token_sent`. Une
 * agence supprimée depuis rend 410 `token_revoked` (TCK-1339) : personne n'y renverrait le lien.
 *
 * 202 dans les deux issues — l'invitant prévenu, ou déjà prévenu dans les 24 h —, pour que la
 * réponse ne dise rien de plus à qui tient le jeton.
 */
class InvitationRenewalRequestController extends Controller
{
    public function __construct(
        private readonly InvitationService $invitations,
        private readonly InvitationRenewalRequests $renewals,
    ) {}

    public function __invoke(string $token): JsonResponse
    {
        try {
            $this->invitations->lookupActiveInvitation($token);
        } catch (ApiError $e) {
            if ($e->errorCode !== 'invitation.token_expired') {
                throw $e;
            }

            /** @var Invitation $invitation */
            $invitation = Invitation::query()->where('token', $token)->with(['agency', 'inviter'])->firstOrFail();
            abort_code_if($invitation->agency_id !== null && $invitation->agency === null, 410, 'invitation.token_revoked');

            $this->renewals->request($invitation);

            return $this->json(['data' => ['status' => 'requested']], 202);
        }

        // Le lien fonctionne encore : rien à renouveler. Le code d'état est celui de l'acceptation
        // (`token_sent`), en 410 comme les autres refus de cette route (le contrat du ticket).
        abort_code(410, 'invitation.token_sent');
    }
}
