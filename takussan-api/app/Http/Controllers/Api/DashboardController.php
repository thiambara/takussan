<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Dashboard\DashboardRoleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-952 (P45.03) — `GET /api/dashboard/stats` est retiré : aucun écran ne le lisait, et sa clé
 * divergeait selon le profil. Les tableaux de bord par rôle ont chacun leur contrôleur.
 */
class DashboardController extends Controller
{
    public function __construct(private readonly DashboardRoleResolver $resolver) {}

    /**
     * GET /api/dashboard/me — adaptive entry returning role + flat metrics + sections.
     * TCK-595 — every account resolves (an account without any other role is a client).
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        // TCK-595 — le résolveur rend toujours une vue : au pire celle du client.
        $metrics = $this->resolver->resolve($user);

        return $this->json([
            'data' => [
                'role' => $metrics->role(),
                'metrics' => $metrics->metrics($user),
                'sections' => $metrics->sections($user),
            ],
        ]);
    }
}
