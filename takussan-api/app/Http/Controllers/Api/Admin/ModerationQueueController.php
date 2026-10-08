<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\DecideBatchModerationQueueRequest;
use App\Http\Requests\Api\Admin\DecideModerationQueueRequest;
use App\Http\Requests\Api\Admin\IndexModerationQueueRequest;
use App\Http\Resources\Api\Admin\ModerationItemResource;
use App\Services\Admin\UnifiedModerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ModerationQueueController extends Controller
{
    public function __construct(private readonly UnifiedModerationService $service) {}

    public function index(IndexModerationQueueRequest $request): JsonResponse
    {
        $data = $request->validated();

        $paginator = $this->service->paginate(
            $data['filter'] ?? [],
            (string) ($data['sort'] ?? '-reported_at'),
            (int) ($data['per_page'] ?? 20),
        );

        return $this->paginated($paginator, ModerationItemResource::collection($paginator)->toArray($request));
    }

    public function decide(DecideModerationQueueRequest $request, string $id): JsonResponse
    {
        $data = $request->validated();

        return $this->json([
            'data' => $this->service->decide(
                $id,
                $request->user(),
                $data['decision'],
                $data['reason'] ?? null,
                $data['reason_code'] ?? null,
            ),
        ]);
    }

    /** TCK-597 — `POST /api/admin/moderation/decide-batch` : un résultat par élément. */
    public function decideBatch(DecideBatchModerationQueueRequest $request): JsonResponse
    {
        $data = $request->validated();

        return $this->json([
            'data' => $this->service->decideBatch(
                $data['ids'],
                $request->user(),
                $data['decision'],
                $data['reason'] ?? null,
                $data['reason_code'] ?? null,
            ),
        ]);
    }

    /** TCK-597 — `POST /api/admin/moderation/{id}/claim` : prendre l'élément pour 10 minutes. */
    public function claim(Request $request, string $id): JsonResponse
    {
        $claim = $this->service->claim($id, $request->user());

        return $this->json(['data' => [
            'id' => $id,
            'by' => ['id' => $claim->claimed_by_id, 'name' => $claim->claimedBy?->full_name ?: $claim->claimedBy?->email],
            'claimed_at' => $claim->claimed_at->toIso8601String(),
            'expires_at' => $claim->expires_at->toIso8601String(),
        ]]);
    }

    /** TCK-597 — `DELETE /api/admin/moderation/{id}/claim` : rendre sa prise. */
    public function release(Request $request, string $id): JsonResponse
    {
        $this->service->release($id, $request->user());

        return $this->json(null, 204);
    }
}
