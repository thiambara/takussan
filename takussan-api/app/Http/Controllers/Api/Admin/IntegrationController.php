<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Models\Integration;
use App\Services\Admin\IntegrationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntegrationController extends Controller
{
    public function __construct(private readonly IntegrationService $integrations) {}

    public function index(): JsonResponse
    {
        return $this->json(['data' => $this->integrations->all()]);
    }

    public function show(Integration $integration): JsonResponse
    {
        return $this->json(['data' => $this->integrations->show($integration)]);
    }

    public function schema(Integration $integration): JsonResponse
    {
        return $this->json(['data' => $this->integrations->schema($integration)]);
    }

    public function update(Request $request, Integration $integration): JsonResponse
    {
        $data = $request->validate([
            'credentials' => ['sometimes', 'array'],
            'is_active' => ['sometimes', 'boolean'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        return $this->json(['data' => $this->integrations->update($integration, $data, $request->user())]);
    }

    public function test(Request $request, Integration $integration): JsonResponse
    {
        return $this->json(['data' => $this->integrations->test($integration, $request->user())]);
    }

    public function webhooks(Integration $integration): JsonResponse
    {
        $paginator = $this->integrations->webhooks($integration);

        return $this->json([
            'data' => collect($paginator->items())->map(fn ($log) => [
                'id' => $log->id,
                'status' => $log->status,
                'direction' => $log->direction,
                'event_type' => $log->event_type,
                'payload' => $log->payload,
                'processed_at' => $log->processed_at?->toISOString(),
                'created_at' => $log->created_at?->toISOString(),
            ])->all(),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
            ],
        ]);
    }
}
