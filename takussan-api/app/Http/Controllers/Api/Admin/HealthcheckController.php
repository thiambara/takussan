<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Services\Admin\HealthcheckService;
use Illuminate\Http\JsonResponse;

class HealthcheckController extends Controller
{
    public function __construct(private readonly HealthcheckService $service) {}

    public function __invoke(): JsonResponse
    {
        return $this->json(['data' => $this->service->snapshot()]);
    }
}
