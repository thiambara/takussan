<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Admin\BusinessEnumService;
use Illuminate\Http\JsonResponse;

class PublicBusinessEnumController extends Controller
{
    public function __construct(private readonly BusinessEnumService $service) {}

    public function show(string $key): JsonResponse
    {
        return $this->json(['data' => $this->service->get($key, activeOnly: true)]);
    }
}
