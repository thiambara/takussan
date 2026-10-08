<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\PlatformAbility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-600 (ADR-0047) — `GET /api/admin/me/abilities` : le niveau et les gestes de l'opérateur
 * courant. Le front filtre la console avec, sans recopier la matrice de {@see PlatformAbility}.
 */
class PlatformAbilityController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $level = $request->user()->activePlatformLevel();

        return $this->json([
            'data' => [
                'level' => $level?->value,
                'abilities' => array_map(
                    fn (PlatformAbility $ability) => $ability->value,
                    $level !== null ? PlatformAbility::forLevel($level) : [],
                ),
            ],
        ]);
    }
}
