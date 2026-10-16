<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Admin\HealthcheckService;
use Illuminate\Http\JsonResponse;

/**
 * Route publique de santé : le statut agrégé, LU DANS LE CACHE que `health:probe` remplit chaque
 * minute, sans détail ni appel sortant (TCK-600). Elle appelait le CDN à chaque requête anonyme.
 *
 * `failed` répond 503, pour qu'une sonde externe sur le code HTTP le voie ; `degraded` et `unknown`
 * restent en 200 (TCK-680, décision du porteur sur P14.02).
 */
class HealthController extends Controller
{
    public function __invoke(HealthcheckService $health): JsonResponse
    {
        $status = $health->publicStatus();

        return $this->json($status, $status['status'] === 'failed' ? 503 : 200);
    }
}
