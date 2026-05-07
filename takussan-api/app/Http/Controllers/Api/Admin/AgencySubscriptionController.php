<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\AssignAgencySubscriptionRequest;
use App\Http\Resources\Api\Admin\AgencySubscriptionResource;
use App\Models\Agency;
use App\Models\Plan;
use App\Services\Billing\AgencySubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AgencySubscriptionController extends Controller
{
    public function __construct(private readonly AgencySubscriptionService $subscriptions) {}

    public function show(Request $request, Agency $agency): JsonResponse
    {
        $subscription = $agency->currentSubscription()->with('plan')->first();

        return $this->json([
            'data' => $subscription ? (new AgencySubscriptionResource($subscription))->resolve($request) : null,
        ]);
    }

    public function store(AssignAgencySubscriptionRequest $request, Agency $agency): JsonResponse
    {
        $plan = Plan::query()->findOrFail($request->integer('plan_id'));
        $subscription = $this->subscriptions->assign($agency, $plan, $request->user(), $request->validated());

        return $this->json([
            'data' => (new AgencySubscriptionResource($subscription))->resolve($request),
        ], 201);
    }

    public function cancel(Request $request, Agency $agency): JsonResponse
    {
        $subscription = $this->subscriptions->cancel($agency, $request->user());

        return $this->json([
            'data' => $subscription ? (new AgencySubscriptionResource($subscription))->resolve($request) : null,
        ]);
    }
}
