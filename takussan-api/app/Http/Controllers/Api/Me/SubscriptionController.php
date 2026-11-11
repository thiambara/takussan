<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\AgencySubscriptionResource;
use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Services\Billing\QuotaResolver;
use App\Services\Billing\UpgradeOffer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    public function __construct(private readonly QuotaResolver $quota) {}

    public function show(Request $request): JsonResponse
    {
        $agencyId = $request->activeProfile()?->agency_id ?? $request->user()->agency_id;
        abort_code_unless($agencyId, 404, 'agency.active_profile_missing');
        // Vérification adverse de TCK-2669 — l'abonnement (limites effectives dont max_agents,
        // surcharges, commission de la plateforme) est un fait interne d'agence : au seul personnel
        // de l'agence du profil actif, comme `agents` de /me/quota. Un bailleur n'y lit rien.
        abort_code_unless($this->readsTeamQuota($request, $agencyId), 403, 'agency.staff_only');

        $subscription = $this->quota->currentSubscription((int) $agencyId);

        return $this->json([
            'data' => $subscription ? (new AgencySubscriptionResource($subscription))->resolve($request) : null,
        ]);
    }

    /**
     * TCK-627 — `GET /api/me/quota` : l'usage du quota d'annonces de l'agence du profil actif,
     * lu par le formulaire du bien AVANT les six étapes. Sans agence résolue, rien ne borne : la
     * création, elle, refusera pour d'autres raisons.
     */
    public function quota(Request $request): JsonResponse
    {
        $agencyId = $request->activeProfile()?->agency_id ?? $request->user()->agency_id;

        return $this->json([
            'data' => ($agencyId
                ? $this->quota->listingUsage((int) $agencyId)
                : ['limit' => null, 'used' => 0, 'can_create' => true])
                // TCK-2669 (AC6) — les agents, à côté des biens : les clés plates restent celles
                // des annonces, que le formulaire du bien lit déjà. L'effectif de l'équipe et la
                // limite du plan sont un fait interne d'agence : au seul personnel de l'agence du
                // profil actif (et au super-admin) — un bailleur lit `null` (vérification adverse).
                + ['agents' => $this->readsTeamQuota($request, $agencyId)
                    ? $this->quota->agentUsage($agencyId ? (int) $agencyId : null)
                    : null],
        ]);
    }

    private function readsTeamQuota(Request $request, mixed $agencyId): bool
    {
        $user = $request->user();
        if ($user->isSuperAdmin() || ! $agencyId) {
            return true;
        }

        return $user->staffAgencyId() === (int) $agencyId;
    }

    /**
     * TCK-2669 (ADR-0104 § 6) — `GET /api/me/upgrade-offer` : le plan que le passage en pro
     * donnera, lu en base (`billing.upgrade_plan_code`). Réservé à qui peut demander le passage :
     * l'administrateur d'une agence individuelle (`AgencyUpgradeRequestPolicy::create`).
     */
    public function upgradeOffer(Request $request, UpgradeOffer $offer): JsonResponse
    {
        $agencyId = $request->activeProfile()?->agency_id ?? $request->user()->agency_id;
        abort_code_unless($agencyId, 404, 'agency.active_profile_missing');

        $this->authorize('create', [AgencyUpgradeRequest::class, Agency::query()->findOrFail($agencyId)]);

        $plan = $offer->plan();
        abort_code_unless($plan, 404, 'plan.upgrade_offer_missing');

        return $this->json(['data' => [
            'code' => $plan->code,
            'label' => $plan->label,
            'monthly_price_xof' => (float) $plan->monthly_price_xof,
            'platform_fee_pct' => (float) $plan->platform_fee_pct,
            'limits' => $plan->limits ?? [],
        ]]);
    }
}
