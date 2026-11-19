<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Conversation\StorePontInvitationRequest;
use App\Models\Conversation;
use App\Models\User;
use App\Services\Pont\InvitationsDuPont;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2981 (ADR-0132 § 3) — « Joindre par WhatsApp » : invite un participant du fil (ou le joint d'emblée si son
 * numéro a déjà donné l'accord au pont). Refus 422 à code `pont.*`. Aucune route « relayer » : le relais suit l'envoi.
 */
class PontInvitationController extends Controller
{
    public function store(StorePontInvitationRequest $request, Conversation $conversation, InvitationsDuPont $invitations): JsonResponse
    {
        $cible = User::query()->find((int) $request->validated('user_id'));
        $code = $cible === null ? 'pont.not_participant' : $invitations->joindre($conversation, $cible);
        abort_code_if($code !== null, 422, (string) $code);

        return $this->json(['data' => ['statut' => 'ok']], 201);
    }
}
