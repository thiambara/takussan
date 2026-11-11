<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ProbeCustomerDuplicateRequest;
use App\Services\Crm\CustomerDuplicateDetector;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2588 — le doublon sondé PENDANT la saisie, et non plus découvert à l'envoi (409) : les fiches
 * de l'agence active au même téléphone normalisé ou au même e-mail replié, cinq au plus, réduites
 * à `{id, name, stage}`. Une fiche que l'appelant ne lit pas se signale sans rien livrer (tout à
 * `null`), comme dans le 409 de `CustomerController::store`. Ni pièce, ni coordonnée, ni adresse.
 */
class CustomerDuplicateProbeController extends Controller
{
    public function __invoke(ProbeCustomerDuplicateRequest $request, CustomerDuplicateDetector $duplicates): JsonResponse
    {
        $user = $request->user();

        $matches = $duplicates->find(
            $user->staffAgencyId(),
            $request->validated('phone'),
            $request->validated('email'),
            $user,
        );

        return $this->json([
            'data' => array_map(fn (array $m) => [
                'id' => $m['id'],
                'name' => $m['name'],
                'stage' => $m['stage'],
            ], $matches),
        ]);
    }
}
