<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Models\Lease;
use App\Models\TenantOnboardingChecklist;
use App\Services\Tenant\TenantOnboardingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-266 — Endpoints lecture + mutation côté locataire pour sa propre
 * checklist d'onboarding.
 *
 *  - `GET    /api/me/leases/{lease}/onboarding-checklist`
 *  - `POST   /api/me/leases/{lease}/onboarding-checklist/{item}/complete`
 *
 * Gating : seul le user lié à `Lease.tenant.user_id` peut lire/écrire.
 * Côté `complete`, l'item attendu est principalement
 * `documents_acknowledged` (les autres sont posés par
 * listeners/observers / WelcomeViewController) — on accepte les 4 pour
 * permettre au front de "rattraper" un état dans des cas edge (e.g. EDL
 * signé hors plateforme).
 */
class TenantOnboardingChecklistController extends Controller
{
    public function show(Request $request, Lease $lease): JsonResponse
    {
        $this->authorizeTenant($request, $lease);

        $checklist = TenantOnboardingChecklist::query()
            ->where('lease_id', $lease->id)
            ->first();

        return $this->json(['data' => $checklist]);
    }

    public function complete(
        Request $request,
        Lease $lease,
        string $item,
        TenantOnboardingService $service,
    ): JsonResponse {
        $this->authorizeTenant($request, $lease);

        if (! in_array($item, TenantOnboardingChecklist::ITEMS, true)) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Unknown checklist item.');
        }

        $checklist = TenantOnboardingChecklist::query()
            ->where('lease_id', $lease->id)
            ->first();

        if ($checklist === null) {
            abort(Response::HTTP_NOT_FOUND, 'Checklist not found for this lease.');
        }

        $checklist = $service->markItem($checklist, $item);

        return $this->json(['data' => $checklist]);
    }

    private function authorizeTenant(Request $request, Lease $lease): void
    {
        $userId = $request->user()->id;
        $lease->loadMissing('tenant');

        $isTenant = $lease->tenant?->user_id === $userId;
        $isAdmin = $request->user()->hasRole(['admin', 'super_admin']);

        abort_unless($isTenant || $isAdmin, Response::HTTP_FORBIDDEN);
    }
}
