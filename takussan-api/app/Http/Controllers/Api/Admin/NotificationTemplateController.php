<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\PreviewNotificationTemplateRequest;
use App\Http\Requests\Api\Admin\UpdateNotificationTemplateRequest;
use App\Services\Admin\NotificationTemplateService;
use Illuminate\Http\JsonResponse;

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

    public function update(UpdateNotificationTemplateRequest $request, string $event, string $channel): JsonResponse
    {
        $data = $request->validated();

        return $this->json(['data' => $this->service->update($event, $channel, $data, $request->user())]);
    }

    public function preview(PreviewNotificationTemplateRequest $request, string $event, string $channel): JsonResponse
    {
        $data = $request->validated();

        return $this->json(['data' => $this->service->preview($event, $channel, $data['locale'], $data['sample_data'] ?? [])]);
    }
}
