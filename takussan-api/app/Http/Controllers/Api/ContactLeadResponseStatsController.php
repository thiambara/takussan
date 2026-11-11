<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ContactLeadResponseStatsRequest;
use App\Policies\PropertyContactLeadPolicy;
use App\Services\Crm\ContactLeadResponseStatsService;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2583 (ADR-0103 § 7) — les délais de première réponse de l'agence et de chaque agent.
 * Réservé au personnel qui lit toute la boîte (`crm.view_all`) : 403 sinon.
 */
class ContactLeadResponseStatsController extends Controller
{
    public function __invoke(
        ContactLeadResponseStatsRequest $request,
        PropertyContactLeadPolicy $policy,
        ContactLeadResponseStatsService $stats,
    ): JsonResponse {
        $user = $request->user();
        $agencyId = $user->isSuperAdmin()
            ? (int) $request->validated('agency_id')
            : (int) $policy->agencyScopeFor($user);

        return $this->json(['data' => $stats->compute($agencyId, $request->periodDays())]);
    }
}
