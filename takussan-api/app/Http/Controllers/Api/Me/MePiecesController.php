<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Policies\DocumentPolicy;
use App\Services\Kyc\PiecesDuProfil;
use App\Support\ImpersonationContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2612 — `GET /api/me/pieces` → `{ data: [{ code, required, kind, state }] }` : les pièces du PROFIL ACTIF
 * (`ResolveActiveProfile`, comme `GET /api/me/espace/demarrage`), lues par l'étape « Pièces » de « Démarrer ».
 *
 * Toujours 200 : un profil sans pièces (admin d'agence, client, aucun) rend `[]`. Le compte ne lit que les pièces de ses
 * propres profils : le profil actif est résolu parmi les siens.
 *
 * TCK-2614 — chaque pièce porte aussi `file` (`{ name, size, sent_at }` | `null`), le fichier envoyé, pour le seul
 * titulaire : sous impersonation, `file` est `null` partout (ADR-0055 § 3 — une pièce de profil ne s'ouvre pas sous le
 * nom de l'opérateur, {@see DocumentPolicy::view}). Même règle pour `number_masked`, le NINEA saisi sous forme masquée.
 */
class MePiecesController extends Controller
{
    public function __invoke(Request $request, PiecesDuProfil $pieces): JsonResponse
    {
        $titulaire = ! app(ImpersonationContext::class)->active();
        $liste = $pieces->pour($request->activeProfile(), avecFichier: $titulaire);

        if (! $titulaire) {
            $liste = array_map(
                fn (array $piece) => $piece + ['file' => null] + ($piece['kind'] === 'file_and_number' ? ['number_masked' => null] : []),
                $liste,
            );
        }

        return $this->json(['data' => $liste]);
    }
}
