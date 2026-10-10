<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\AgencySubscriptionResource;
use App\Services\Billing\QuotaResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    public function __construct(private readonly QuotaResolver $quota) {}

    public function show(Request $request): JsonResponse
    {
        $agencyId = $request->activeProfile()?->agency_id ?? $request->user()->agency_id;
        abort_code_unless($agencyId, 404, 'agency.active_profile_missing');

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
            'data' => $agencyId
                ? $this->quota->listingUsage((int) $agencyId)
                : ['limit' => null, 'used' => 0, 'can_create' => true],
        ]);
    }
}
