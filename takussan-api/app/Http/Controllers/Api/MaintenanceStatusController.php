<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Admin\MaintenanceService;
use Illuminate\Http\JsonResponse;

class MaintenanceStatusController extends Controller
{
    public function __construct(private readonly MaintenanceService $maintenance) {}

    public function __invoke(): JsonResponse
    {
        return $this->json(
            ['data' => $this->maintenance->status()],
            headers: ['Cache-Control' => 'max-age=60, public'],
        );
    }
}
