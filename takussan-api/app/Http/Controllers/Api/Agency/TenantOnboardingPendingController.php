<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Lease;
use App\Models\TenantOnboardingChecklist;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-266 — Console agence : queue des locataires dont l'onboarding
 * traîne (EDL d'entrée non signé > 7 j).
 *
 * `GET /api/agencies/{agency}/tenant-onboarding-pending`
 *
 * Filtré par agence (jointure `leases.agency_id`) et par retard
 * `created_at < now()-7d`. Trié par défaut sur `created_at` asc (les
 * plus anciens en premier — ceux qu'il faut relancer en priorité).
 * Spatie HasQueryBuilder : le front peut surcharger sort/include si
 * besoin via les query params habituels.
 */
class TenantOnboardingPendingController extends Controller
{
    public function index(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        // Membership is resolved by any agency-scoped profile (Agent /
        // Owner / AgencyAdmin) pointing at this agency, not by the legacy
        // `agency_id` accessor which returns null for multi-profile users
        // without an active profile resolved (TCK-142).
        $isMember = $user->isAgentAt($agency->id)
            || $user->isOwnerAt($agency->id)
            || $user->agencyAdminProfiles()->where('agency_id', $agency->id)->exists();
        $isAdmin = $user->isSuperAdmin();

        abort_unless($isMember || $isAdmin, Response::HTTP_FORBIDDEN);

        $cutoff = now()->subDays(7);

        $base = TenantOnboardingChecklist::query()
            ->whereNull('completed_at')
            ->where('created_at', '<', $cutoff)
            ->whereIn('lease_id', Lease::query()
                ->where('agency_id', $agency->id)
                ->select('id'));

        $query = TenantOnboardingChecklist::buildQuery($base, $request)
            ->defaultSort('created_at');

        $perPage = (int) $request->integer('per_page', 20);
        $perPage = max(1, min($perPage, 100));

        $page = $query->paginate($perPage);

        return $this->json($page);
    }
}
