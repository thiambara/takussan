<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreAgencyOnboardingRequest;
use App\Http\Resources\Api\Admin\AgencyProvisioningResource;
use App\Services\Admin\AgencyProvisioningService;
use Illuminate\Http\JsonResponse;

class AgencyOnboardingController extends Controller
{
    public function store(
        StoreAgencyOnboardingRequest $request,
        AgencyProvisioningService $provisioning,
    ): JsonResponse {
        $result = $provisioning->provision($request->validated(), $request->user());

        return $this->json([
            'data' => (new AgencyProvisioningResource($result))->resolve($request),
        ], 201);
    }
}
