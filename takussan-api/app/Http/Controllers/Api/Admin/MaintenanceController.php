<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Services\Admin\MaintenanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MaintenanceController extends Controller
{
    public function __construct(private readonly MaintenanceService $maintenance) {}

    public function show(): JsonResponse
    {
        return $this->json(['data' => $this->maintenance->status()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'starts_at' => ['required', 'date', 'after_or_equal:now'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
            'mode' => ['required', Rule::in(['banner', 'read_only', 'down'])],
            'severity' => ['required', Rule::in(['info', 'scheduled', 'interruption'])],
            'messages' => ['required', 'array'],
            'messages.fr' => ['required', 'string', 'max:500'],
            'messages.en' => ['nullable', 'string', 'max:500'],
            'messages.wo' => ['nullable', 'string', 'max:500'],
            'banner_lead_minutes' => ['nullable', 'integer', 'min:1', 'max:1440'],
        ]);

        return $this->json(['data' => $this->maintenance->schedule($data, $request->user())], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        return $this->json(['data' => $this->maintenance->cancel($request->user())]);
    }
}
