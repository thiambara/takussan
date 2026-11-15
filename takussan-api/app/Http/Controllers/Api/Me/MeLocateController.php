<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Me\LocateRequest;
use App\Services\Profiles\OuEstLaFiche;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2847 (ADR-0116) — `GET /api/me/locate?type={bien|demande|…}&id={id}` → `{ data: { profile_id,
 * agency: {id, name} | null, role } }` : l'espace de l'appelant sous lequel la fiche se lit, pour que
 * la page « introuvable » propose d'y basculer. Jamais une donnée de la fiche.
 *
 * Fiche absente, en corbeille, ou lue par aucun profil actif : le MÊME 404, par ce seul chemin.
 */
class MeLocateController extends Controller
{
    public function __invoke(LocateRequest $request, OuEstLaFiche $ouEst): JsonResponse
    {
        $profil = $ouEst->localiser($request->user(), $request->type(), $request->identifiant());
        if ($profil === null) {
            abort(404);
        }

        return $this->json(['data' => $ouEst->enReponse($profil)]);
    }
}
