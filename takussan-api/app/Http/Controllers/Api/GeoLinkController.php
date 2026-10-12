<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\GeoResolveLinkRequest;
use App\Services\Geo\GeoLinkResolver;
use App\Services\Geo\Senegal;
use Illuminate\Http\JsonResponse;

/** TCK-633 (AC9) — `POST /api/geo/resolve-link`. */
class GeoLinkController extends Controller
{
    public function __invoke(GeoResolveLinkRequest $request, GeoLinkResolver $resolveur): JsonResponse
    {
        $lu = $resolveur->resoudre((string) $request->validated('url'));
        abort_code_if($lu === null, 422, 'geo.link_unresolved');

        return $this->json(['data' => [
            'latitude' => $lu['latitude'],
            'longitude' => $lu['longitude'],
            'outside_senegal' => ! Senegal::contient($lu['latitude'], $lu['longitude']),
        ]]);
    }
}
