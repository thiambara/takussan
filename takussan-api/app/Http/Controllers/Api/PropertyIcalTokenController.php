<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-596 §3B (ADR-0041 §3) — (re)génère le jeton d'export iCal d'un bien. Le jeton est aléatoire
 * (256 bits), stocké HACHÉ, et l'URL n'est rendue qu'ici, une fois : la régénération tue l'ancienne.
 */
class PropertyIcalTokenController extends Controller
{
    public function store(Request $request, Property $property): JsonResponse
    {
        $this->authorize('update', $property);

        $token = bin2hex(random_bytes(32));
        $property->forceFill(['ical_export_token_hash' => hash('sha256', $token)])->save();

        return $this->json([
            'data' => ['url' => route('ical.export', ['token' => $token])],
        ], 201);
    }
}
