<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\UpdateBusinessEnumValueRequest;
use App\Services\Admin\BusinessEnumService;
use Illuminate\Http\JsonResponse;

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

    public function updateValue(UpdateBusinessEnumValueRequest $request, string $key, string $value): JsonResponse
    {
        return $this->json([
            'data' => $this->service->updateValue($key, $value, $request->validated(), $request->user()),
        ]);
    }
}
