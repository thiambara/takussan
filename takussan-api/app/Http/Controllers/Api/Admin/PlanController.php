<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StorePlanRequest;
use App\Http\Requests\Api\Admin\UpdatePlanRequest;
use App\Http\Resources\Api\Admin\PlanResource;
use App\Models\Plan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $plans = Plan::buildQuery(request: $request)
            ->defaultSort('sort_order')
            ->get();

        return $this->json(['data' => PlanResource::collection($plans)->resolve($request)]);
    }

    public function store(StorePlanRequest $request): JsonResponse
    {
        $plan = Plan::query()->create($request->validated());

        activity('Billing')
            ->causedBy($request->user())
            ->performedOn($plan)
            ->event('super_admin_plan_created')
            ->log('Plan created');

        return $this->json(['data' => (new PlanResource($plan))->resolve($request)], 201);
    }

    public function update(UpdatePlanRequest $request, Plan $plan): JsonResponse
    {
        $data = $request->validated();

        // TCK-2114 (P214.02) — `limits` se FUSIONNE clé par clé avec les bornes en base, comme
        // `settings` d'une agence (TCK-593) : `limits: {max_agents: 5}` effaçait les deux autres
        // bornes, qu'un plan sans borne lit comme illimitées. Une clé envoyée à `null` est retirée ;
        // `limits: null` en entier garde son sens (le plan n'a plus de bornes).
        if (is_array($data['limits'] ?? null)) {
            $data['limits'] = array_filter(
                array_replace($plan->limits ?? [], $data['limits']),
                fn ($value) => $value !== null,
            );
        }

        $plan->update($data);

        activity('Billing')
            ->causedBy($request->user())
            ->performedOn($plan)
            ->event('super_admin_plan_updated')
            ->log('Plan updated');

        return $this->json(['data' => (new PlanResource($plan->refresh()))->resolve($request)]);
    }

    public function destroy(Request $request, Plan $plan): JsonResponse
    {
        abort_code_if($plan->subscriptions()->exists(), 409, 'plan.in_use');

        activity('Billing')
            ->causedBy($request->user())
            ->performedOn($plan)
            ->event('super_admin_plan_deleted')
            ->log('Plan deleted');

        $plan->delete();

        return $this->json(['data' => ['deleted' => true]]);
    }
}
