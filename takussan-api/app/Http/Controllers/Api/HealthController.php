<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Admin\HealthcheckService;
use Illuminate\Http\JsonResponse;

/**
 * Route publique de santé : le statut agrégé, LU DANS LE CACHE que `health:probe` remplit chaque
 * minute, sans détail ni appel sortant (TCK-600). Elle appelait le CDN à chaque requête anonyme.
 */
class HealthController extends Controller
{
    public function __invoke(HealthcheckService $health): JsonResponse
    {
        return $this->json($health->publicStatus());
    }
}
