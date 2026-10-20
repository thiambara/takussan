<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
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
}
