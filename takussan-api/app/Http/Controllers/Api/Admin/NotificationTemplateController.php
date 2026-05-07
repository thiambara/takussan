<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Services\Admin\NotificationTemplateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationTemplateController extends Controller
{
    public function __construct(private readonly NotificationTemplateService $service) {}

    public function index(): JsonResponse
    {
        return $this->json(['data' => $this->service->all()]);
    }

    public function show(string $event, string $channel): JsonResponse
    {
        return $this->json(['data' => $this->service->get($event, $channel)]);
    }

    public function update(Request $request, string $event, string $channel): JsonResponse
    {
        $data = $request->validate([
            'templates' => ['required', 'array'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        return $this->json(['data' => $this->service->update($event, $channel, $data, $request->user())]);
    }

    public function preview(Request $request, string $event, string $channel): JsonResponse
    {
        $data = $request->validate([
            'locale' => ['required', 'string', 'in:fr,en,wo'],
            'sample_data' => ['sometimes', 'array'],
        ]);

        return $this->json(['data' => $this->service->preview($event, $channel, $data['locale'], $data['sample_data'] ?? [])]);
    }
}
