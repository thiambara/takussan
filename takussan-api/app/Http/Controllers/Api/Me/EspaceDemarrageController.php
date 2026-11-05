<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Services\Onboarding\DemarrageDeLEspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2479 (ADR-0089 §5) — `GET /api/me/espace/demarrage` → `{ data: { etapes: [{ code, faite }] } }` :
 * les étapes du groupe « Démarrer » du menu, jugées sur le profil actif (`ResolveActiveProfile`).
 *
 * Toujours 200 : un profil sans étape rend `etapes: []`, et le menu n'affiche rien.
 *
 * Distinct de `GET /api/agencies/{agency}/setup-status` (la carte du tableau de bord d'agence : sept
 * étapes, une agence désignée, 403 hors admin) : celui-ci suit l'espace du compte et sert aussi le
 * bailleur. Les deux lisent le même état ({@see DemarrageDeLEspace}).
 */
class EspaceDemarrageController extends Controller
{
    public function __invoke(Request $request, DemarrageDeLEspace $demarrage): JsonResponse
    {
        return $this->json(['data' => [
            'etapes' => $demarrage->pour($request->user(), $request->activeProfile()),
        ]]);
    }
}
