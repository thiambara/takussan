<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Services\Admin\PlatformSettingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlatformSettingController extends Controller
{
    public function __construct(private readonly PlatformSettingService $settings) {}

    public function index(): JsonResponse
    {
        return $this->json(['data' => $this->settings->grouped()]);
    }

    public function bulkUpdate(Request $request): JsonResponse
    {
        return $this->json([
            'data' => $this->settings->bulkUpdate($request->all(), $request->user()),
        ]);
    }

    public function publicIndex(): JsonResponse
    {
        return $this->json(
            ['data' => $this->settings->publicSettings()],
            headers: ['Cache-Control' => 'public, max-age=300'],
        );
    }
}
