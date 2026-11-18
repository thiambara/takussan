<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Conversation\OpenRoomRequest;
use App\Http\Resources\ConversationResource;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\SallesDuFil;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2960 (ADR-0128 § 2) — l'entrée dans la salle d'un bail ou d'une réservation depuis sa fiche
 * (TCK-2963) : ouvrir la crée si elle manque, synchronise ses membres (le contact principal d'une
 * réservation y est transmis ici), et la rend comme `GET /api/conversations/{conversation}`.
 *
 * 201 si CET appel l'a créée, 200 sinon ; 403 si l'appelant ne lit pas l'objet (`OpenRoomRequest`) ou
 * n'a pas accès à la salle après synchronisation (il n'en est pas partie) ; 422 pour un type sans salle.
 */
class ConversationRoomController extends Controller
{
    public function store(OpenRoomRequest $request, SallesDuFil $salles, ConversationAccess $access): JsonResponse
    {
        $objet = $request->objet();
        abort_if($objet === null, 404);

        $salle = $salles->ouvrir($objet);
        abort_if($salle === null || ! $access->allows($request->user(), $salle), 403);

        $creee = $salle->wasRecentlyCreated;
        $salle->loadForDetail();

        return $this->json([
            'data' => [
                ...ConversationResource::make($salle)->resolve($request),
                'abilities' => [
                    'can_send_message' => $access->allowsWriting($request->user(), $salle),
                ],
            ],
        ], $creee ? 201 : 200);
    }
}
