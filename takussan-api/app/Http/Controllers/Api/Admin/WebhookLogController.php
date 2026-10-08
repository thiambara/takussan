<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\ReplayWebhookLogRequest;
use App\Http\Resources\IntegrationWebhookLogResource;
use App\Models\IntegrationWebhookLog;
use App\Services\Webhooks\WebhookReplayer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-602 (ADR-0051 §4-5) — le journal des webhooks entrants, pour la console : liste filtrable
 * (`filter[channel|provider|status|agency_id|unmatched]`), détail expurgé, rejeu.
 */
class WebhookLogController extends Controller
{
    public function __construct(private readonly WebhookReplayer $replayer) {}

    public function index(Request $request): JsonResponse
    {
        $paginator = IntegrationWebhookLog::buildQuery(request: $request)
            ->defaultSort('-created_at')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 25))));

        return $this->paginated($paginator, IntegrationWebhookLogResource::collection($paginator->items())->resolve());
    }

    public function show(IntegrationWebhookLog $webhookLog): JsonResponse
    {
        return $this->json(['data' => IntegrationWebhookLogResource::make($webhookLog)->resolve()]);
    }

    public function replay(ReplayWebhookLogRequest $request, IntegrationWebhookLog $webhookLog): JsonResponse
    {
        $log = $this->replayer->replay($webhookLog, $request->user());

        return $this->json(['data' => IntegrationWebhookLogResource::make($log)->resolve()]);
    }
}
