<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\LeaseDefaultsRequest;
use App\Services\Lease\LeaseDefaults;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2643 — `GET /api/leases/defaults?property_id=` : le préremplissage d'un bail neuf, et la source
 * de chaque valeur (`property`, `agency`, `platform`). Lecture seule ; la règle est dans
 * {@see LeaseDefaults}, l'autorisation dans `LeasePolicy::createOn` (via la requête).
 */
class LeaseDefaultsController extends Controller
{
    public function __invoke(LeaseDefaultsRequest $request, LeaseDefaults $defaults): JsonResponse
    {
        return $this->json(['data' => $defaults->for($request->property(), $request->user())]);
    }
}
