<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Services\Kyc\PiecesDuProfil;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2612 — `GET /api/me/pieces` → `{ data: [{ code, required, kind, state }] }` : les pièces du PROFIL ACTIF
 * (`ResolveActiveProfile`, comme `GET /api/me/espace/demarrage`), lues par l'étape « Pièces » de « Démarrer ».
 *
 * Toujours 200 : un profil sans pièces (admin d'agence, client, aucun) rend `[]`. Le compte ne lit que les pièces de ses
 * propres profils : le profil actif est résolu parmi les siens.
 */
class MePiecesController extends Controller
{
    public function __invoke(Request $request, PiecesDuProfil $pieces): JsonResponse
    {
        return $this->json(['data' => $pieces->pour($request->activeProfile())]);
    }
}
