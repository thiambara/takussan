<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreBusinessEnumValueRequest;
use App\Http\Requests\Api\Admin\UpdateBusinessEnumValueRequest;
use App\Services\Admin\BusinessEnumService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BusinessEnumController extends Controller
{
    public function __construct(private readonly BusinessEnumService $service) {}

    public function index(): JsonResponse
    {
        return $this->json(['data' => $this->service->all()]);
    }

    public function show(string $key): JsonResponse
    {
        return $this->json(['data' => $this->service->get($key)]);
    }

    public function storeValue(StoreBusinessEnumValueRequest $request, string $key): JsonResponse
    {
        return $this->json([
            'data' => $this->service->addValue($key, $request->validated(), $request->user()),
        ], 201);
    }

    public function updateValue(UpdateBusinessEnumValueRequest $request, string $key, string $value): JsonResponse
    {
        return $this->json([
            'data' => $this->service->updateValue($key, $value, $request->validated(), $request->user()),
        ]);
    }

    public function deactivateValue(Request $request, string $key, string $value): JsonResponse
    {
        return $this->json([
            'data' => $this->service->deactivateValue($key, $value, $request->user()),
        ]);
    }
}
