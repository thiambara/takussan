<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\RejectPropertyRequest;
use App\Http\Resources\PropertyResource;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Services\Property\PropertyModerationService;
use App\Support\AgencyKindGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-098 — Admin-only moderation queue for properties.
 *
 * All routes require `agency_admin` or `super_admin`.
 */
class PropertyModerationController extends Controller
{
    public function __construct(private readonly PropertyModerationService $service) {}

    /**
     * GET /api/admin/properties/moderation
     *
     * Paginated queue of properties in `pending_review`, sorted by `submitted_at`.
     * Supports `filter[search]`, `per_page`.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->isSuperAdmin() || ($user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id)), 403);

        $query = Property::query()
            ->with(['owner', 'agency', 'address'])
            ->where('status', PropertyStatus::PendingReview);

        // An agency_admin only sees their own agency's queue. We read the
        // agency from the active profile (set by ResolveActiveProfile) so a
        // multi-agency admin who switched profiles gets the correct slice.
        if (! $user->isSuperAdmin()) {
            $activeAgencyId = $request->activeProfile()?->agency_id ?? $user->agency_id;
            AgencyKindGuard::ensureStandardForNonGlobal($user, $activeAgencyId);
            $query->where('agency_id', $activeAgencyId);
        }

        if ($search = $request->string('filter.search')->trim()->value()) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', '%'.$search.'%')
                    ->orWhere('reference_number', 'like', '%'.$search.'%');
            });
        }

        $query->orderBy('submitted_at');

        $perPage = (int) $request->input('per_page', 20);
        $paginator = $query->paginate($perPage);

        return $this->json([
            'data' => PropertyResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'pending_count' => $paginator->total(),
            ],
        ]);
    }

    /**
     * POST /api/admin/properties/{property}/approve
     */
    public function approve(Request $request, Property $property): JsonResponse
    {
        abort_unless($request->user()->can('approve-property', $property), 403);
        AgencyKindGuard::ensureStandardForNonGlobal($request->user(), $property->agency_id);

        $property = $this->service->approve($property, $request->user());

        return $this->json(['data' => PropertyResource::make($property)->toArray($request)]);
    }

    /**
     * POST /api/admin/properties/{property}/reject
     */
    public function reject(RejectPropertyRequest $request, Property $property): JsonResponse
    {
        abort_unless($request->user()->can('reject-property', $property), 403);
        AgencyKindGuard::ensureStandardForNonGlobal($request->user(), $property->agency_id);

        $property = $this->service->reject($property, $request->user(), $request->string('rejection_reason')->value());

        return $this->json(['data' => PropertyResource::make($property)->toArray($request)]);
    }

    /**
     * POST /api/admin/properties/{property}/resubmit
     */
    public function resubmit(Request $request, Property $property): JsonResponse
    {
        abort_unless($request->user()->can('resubmit-property', $property), 403);
        AgencyKindGuard::ensureStandardForNonGlobal($request->user(), $property->agency_id);

        $property = $this->service->resubmit($property, $request->user());

        return $this->json(['data' => PropertyResource::make($property)->toArray($request)]);
    }
}
