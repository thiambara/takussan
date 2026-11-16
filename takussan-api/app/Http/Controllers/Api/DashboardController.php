<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Dashboard\Adapters\AgentMeMetrics;
use App\Services\Dashboard\AgentDaySuggestions;
use App\Services\Dashboard\DashboardRoleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-952 (P45.03) — `GET /api/dashboard/stats` est retiré : aucun écran ne le lisait, et sa clé
 * divergeait selon le profil. Les tableaux de bord par rôle ont chacun leur contrôleur.
 */
class DashboardController extends Controller
{
    public function __construct(
        private readonly DashboardRoleResolver $resolver,
        private readonly AgentDaySuggestions $suggestions,
    ) {}

    /**
     * GET /api/dashboard/me — adaptive entry returning role + flat metrics + sections.
     * TCK-595 — every account resolves (an account without any other role is a client).
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        // TCK-595 — le résolveur rend toujours une vue : au pire celle du client.
        $metrics = $this->resolver->resolve($user);

        $data = [
            'role' => $metrics->role(),
            'metrics' => $metrics->metrics($user),
            'sections' => $metrics->sections($user),
        ];

        // TCK-2855 — `include=suggestions` : les gestes nominatifs de « Ma journée », pour l'agent seul.
        // Calculés sur demande seulement : le rapprochement coûte plus que les chiffres.
        if ($metrics instanceof AgentMeMetrics && $this->includes($request, 'suggestions')) {
            $data['suggestions'] = $this->suggestions->for($user);
        }

        return $this->json(['data' => $data]);
    }

    /** `include=a,b` ; une valeur qui n'est pas une chaîne (tableau) n'inclut rien. */
    private function includes(Request $request, string $name): bool
    {
        $include = $request->query('include');

        return is_string($include) && in_array($name, array_map('trim', explode(',', $include)), true);
    }
}
