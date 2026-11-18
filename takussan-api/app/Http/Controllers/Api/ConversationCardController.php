<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Conversation\StoreConversationCardRequest;
use App\Http\Resources\MessageResource;
use App\Models\Conversation;
use App\Models\PropertyVisit;
use App\Services\Messaging\CodesDuFil;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Messaging\FaitsDesMessages;
use App\Services\Messaging\ObjetsDesMessages;
use App\Services\Messaging\SujetsDuFil;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2964 (ADR-0128 §§ 3 et 4) — poser un objet dans un fil : la carte d'un bien partagé
 * (`property.shared`) ou du créneau d'une visite (`visit.proposed`, la visite ayant été créée d'abord
 * par sa propre route, `POST /api/property-visits`).
 *
 * Le code est celui de la SEULE carte du type ({@see CodesDuFil::carteDePose()}) et `data` est dérivé
 * de l'objet, jamais de la requête. L'écriture passe par {@see EvenementsDuFil::carte()}, donc par
 * `ConversationWriter::post` : droit d'écrire rejugé, pointeur du fil, non lu pour les autres,
 * notification ordinaire (`NotifyNewMessageJob`, extrait lisible dans la langue du destinataire).
 *
 * Réponse : le message rendu comme dans le fil, son `object` relu pour l'auteur.
 */
class ConversationCardController extends Controller
{
    public function store(StoreConversationCardRequest $request, Conversation $conversation, EvenementsDuFil $evenements): JsonResponse
    {
        $objet = $request->objet();
        abort_if($objet === null, 403);
        $auteur = $request->user();

        $code = CodesDuFil::carteDePose(SujetsDuFil::typeDe($objet));
        $message = $evenements->carte($conversation, $auteur, $objet, $code, self::donnees($objet));

        return $this->json([
            'data' => MessageResource::make($message)
                ->avecFaits(FaitsDesMessages::pour($auteur, $conversation))
                ->avecObjets(ObjetsDesMessages::pour($auteur, collect([$message]), $request))
                ->resolve($request),
        ], 201);
    }

    /**
     * Les clés de `data` que le code admet, lues sur l'objet : l'instant d'une visite (une date, que tout
     * participant du fil peut lire), rien pour un bien (prix et titre se relisent par la projection).
     *
     * @return array<string, scalar|null>
     */
    private static function donnees(Model $objet): array
    {
        return $objet instanceof PropertyVisit
            ? ['scheduled_at' => $objet->scheduled_at?->toIso8601String()]
            : [];
    }
}
