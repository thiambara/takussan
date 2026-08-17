<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\DecideModerationQueueRequest;
use App\Http\Requests\Api\Admin\IndexModerationQueueRequest;
use App\Http\Resources\Api\Admin\ModerationItemResource;
use App\Services\Admin\UnifiedModerationService;
use Illuminate\Http\JsonResponse;

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
                $data['reason'],
            ),
        ]);
    }
}
