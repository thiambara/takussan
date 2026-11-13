<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Public\PublicPublishDemandRequest;
use App\Services\Search\DemandeDePublication;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2603 (ADR-0088, cinquième sortie) — le départ de la publication : combien de recherches des 7 derniers jours
 * visent la ville, `{data: {city, searches_7d}}`, `searches_7d` à `null` sous le seuil. Public, sans compte.
 */
class PublicPublishDemandController extends Controller
{
    public function __invoke(PublicPublishDemandRequest $request, DemandeDePublication $demande): JsonResponse
    {
        return $this->json(['data' => $demande->pour($request->ville())]);
    }
}
