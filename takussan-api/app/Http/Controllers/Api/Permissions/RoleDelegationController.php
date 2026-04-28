<?php

namespace App\Http\Controllers\Api\Permissions;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Permissions\StoreRoleDelegationRequest;
use App\Http\Resources\Permissions\RoleDelegationResource;
use App\Models\Agency;
use App\Models\RoleDelegation;
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

class RoleDelegationController extends Controller
{
    public function __construct(
        private readonly RoleDelegationService $service,
    ) {}

    public function index(Agency $agency, Request $request): JsonResponse
    {
        Gate::authorize('viewAny', [RoleDelegation::class, $agency]);

        $query = QueryBuilder::for(RoleDelegation::class)
            ->where('agency_id', $agency->id)
            ->allowedFilters(
                AllowedFilter::exact('status'),
                AllowedFilter::exact('user_id'),
            )
            ->defaultSort('-created_at')
            ->with(['user', 'delegator', 'revokedBy']);

        $paginated = $query->paginate($request->input('per_page', 20));

        return $this->json([
            'data' => RoleDelegationResource::collection($paginated),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }

    public function store(Agency $agency, StoreRoleDelegationRequest $request): JsonResponse
    {
        Gate::authorize('create', [RoleDelegation::class, $agency]);

        $delegation = $this->service->create($agency, $request->user(), $request->validated());
        $delegation->load(['user', 'delegator']);

        return $this->json([
            'data' => RoleDelegationResource::make($delegation),
        ], 201);
    }

    public function destroy(Agency $agency, RoleDelegation $delegation, Request $request): JsonResponse
    {
        abort_unless($delegation->agency_id === $agency->id, 404);

        Gate::authorize('revoke', $delegation);

        $this->service->revoke($delegation, $request->user());
        $delegation->refresh()->load(['user', 'delegator', 'revokedBy']);

        return $this->json([
            'data' => RoleDelegationResource::make($delegation),
        ]);
    }
}
