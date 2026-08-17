<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreMaintenanceRequest;
use App\Services\Admin\MaintenanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MaintenanceController extends Controller
{
    public function __construct(private readonly MaintenanceService $maintenance) {}

    public function show(): JsonResponse
    {
        return $this->json(['data' => $this->maintenance->status()]);
    }

    public function store(StoreMaintenanceRequest $request): JsonResponse
    {
        $data = $request->validated();

        return $this->json(['data' => $this->maintenance->schedule($data, $request->user())], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        return $this->json(['data' => $this->maintenance->cancel($request->user())]);
    }
}
