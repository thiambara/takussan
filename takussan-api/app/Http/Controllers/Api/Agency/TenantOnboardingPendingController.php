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
 * Réservée au PERSONNEL de l'agence — `agent` / `agency_admin` — et aux
 * super-admins. Le bailleur (`OwnerProfile`) en est exclu : c'est une file
 * de relance interne, et c'est ce que déclarent la route (TCK-266), le menu
 * et la garde de page du front. Cf. TCK-378 (revue).
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
        // TCK-378 (revue) — le PERSONNEL de l'agence, le bailleur EXCLU.
        //
        // La qualité de membre se lit sur les profils rattachés à CETTE agence, jamais
        // sur l'accesseur `agency_id` hérité, qui rend `null` dès qu'un utilisateur
        // porte plusieurs profils sans profil actif résolu (TCK-142).
        //
        // `isOwnerAt()` figurait ici et n'aurait pas dû : cette file est un écran de
        // relance INTERNE. Le bailleur n'y a aucun rôle — la route le déclare depuis
        // TCK-266, le menu ne la lui montre pas, et `assertCanReachAgencyStaffArea`
        // (front) l'en écarte. Une garde de rendu devant une API qui répond 200 ne
        // protège rien : le contenu part sur le réseau. Mesuré avant correctif :
        // un simple `OwnerProfile` sur l'agence obtenait 200 et les lignes de la file.
        $isStaff = $user->isAgentAt($agency->id)
            || $user->agencyAdminProfiles()->where('agency_id', $agency->id)->exists();
        $isAdmin = $user->isSuperAdmin();

        abort_unless($isStaff || $isAdmin, Response::HTTP_FORBIDDEN);

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
