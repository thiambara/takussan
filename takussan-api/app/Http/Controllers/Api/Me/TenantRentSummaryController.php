<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Services\Payments\TenantRentSummary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2649 (ADR-0100) — `GET /api/me/rent-summary` → `{ data: { total_due, parts, items, next_rent,
 * schedule_state, lease, offline_payment, currency } }` : ce que le locataire connecté doit, en un
 * montant, pénalités comprises ({@see TenantRentSummary}).
 *
 * Toujours 200, et seulement sur les baux dont l'appelant est le locataire (ses fiches client) : il
 * n'y a ni ressource désignée ni tiers à autoriser. Sans bail, `schedule_state` et `lease` sont nuls
 * et le total vaut 0.
 */
class TenantRentSummaryController extends Controller
{
    public function __invoke(Request $request, TenantRentSummary $summary): JsonResponse
    {
        return $this->json(['data' => $summary->for($request->user())]);
    }
}
