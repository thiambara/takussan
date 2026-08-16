<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\Capability;
use Illuminate\Http\JsonResponse;

/**
 * TCK-279 — `GET /api/capabilities` : catalogue plateforme, en lecture.
 *
 * Le catalogue est **code-defined** (ADR-0003) : il n'y a rien à paginer et
 * rien à filtrer côté serveur, la réponse tient en une centaine de lignes
 * et se mémoïse côté front (`staleTime` infini). Groupé par domaine, ce
 * qu'attend la matrice de l'UI.
 *
 * Aucun libellé n'est émis : le front possède le texte affiché (principe 5).
 */
class CapabilityController extends Controller
{
    public function index(): JsonResponse
    {
        $byDomain = [];
        foreach (Capability::cases() as $capability) {
            $byDomain[$capability->domain()][] = $capability->value;
        }

        $domains = [];
        foreach ($byDomain as $domain => $capabilities) {
            $domains[] = [
                'domain' => $domain,
                'capabilities' => $capabilities,
            ];
        }

        return $this->json([
            'data' => [
                'domains' => $domains,
                'total' => count(Capability::cases()),
            ],
        ]);
    }
}
