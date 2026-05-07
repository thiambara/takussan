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
        abort_unless($agencyId, 404, 'No active agency profile.');

        $subscription = $this->quota->currentSubscription((int) $agencyId);

        return $this->json([
            'data' => $subscription ? (new AgencySubscriptionResource($subscription))->resolve($request) : null,
        ]);
    }
}
