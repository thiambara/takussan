<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\ModerationItemResource;
use App\Services\Admin\UnifiedModerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ModerationQueueController extends Controller
{
    public function __construct(private readonly UnifiedModerationService $service) {}

    public function index(Request $request): JsonResponse
    {
        $data = validator([
            'filter' => $request->query('filter', []),
            'sort' => $request->query('sort', '-reported_at'),
            'per_page' => $request->query('per_page', 20),
        ], [
            'filter.type' => ['nullable', Rule::in(['property', 'review'])],
            'filter.status' => ['nullable', Rule::in(['pending', 'flagged'])],
            'filter.agency_id' => ['nullable', 'integer', 'min:1'],
            'sort' => ['nullable', Rule::in(['reported_at', '-reported_at', 'created_at', '-created_at'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ])->validate();

        $paginator = $this->service->paginate(
            $data['filter'] ?? [],
            (string) ($data['sort'] ?? '-reported_at'),
            (int) ($data['per_page'] ?? 20),
        );

        return $this->paginated($paginator, ModerationItemResource::collection($paginator)->toArray($request));
    }

    public function decide(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'decision' => ['required', Rule::in(['approve', 'reject', 'hide', 'remove'])],
            'reason' => ['required', 'string', 'max:1000'],
        ]);

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
