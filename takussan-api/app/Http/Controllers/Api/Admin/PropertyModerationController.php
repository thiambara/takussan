<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\RejectPropertyRequest;
use App\Http\Resources\PropertyResource;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Services\Property\PropertyModerationService;
use App\Support\AgencyKindGuard;
use App\Support\CaseInsensitive;
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
            // TCK-1840 (P186.02) — `like` nu : sensible à la casse sous PostgreSQL, et `%` y valait
            // un joker. Même forme que TCK-600 (piège n° 9 du CLAUDE.md de l'API).
            $motif = '%'.addcslashes(CaseInsensitive::fold($search), '\\%_').'%';
            $query->where(function ($q) use ($motif) {
                $q->whereRaw(CaseInsensitive::sql('title').' like ?', [$motif])
                    ->orWhereRaw(CaseInsensitive::sql('reference_number').' like ?', [$motif]);
            });
        }

        // TCK-1300 (P118.05) — un ordre total : des biens soumis dans la même seconde, ou sans
        // `submitted_at`, se départagent par l'`id`, comme les autres files de `Admin\*` (TCK-1138).
        $query->orderBy('submitted_at')->orderBy('properties.id');

        $perPage = $this->tailleDePage($request, 20);
        $paginator = $query->paginate($perPage);

        return $this->json([
            'data' => PropertyResource::collection($paginator)->toArray($request),
            'meta' => $this->paginationMeta($paginator, ['pending_count' => $paginator->total()]),
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

        return $this->json(['data' => PropertyResource::make($property)->resolve($request)]);
    }

    /**
     * POST /api/admin/properties/{property}/reject
     */
    public function reject(RejectPropertyRequest $request, Property $property): JsonResponse
    {
        abort_unless($request->user()->can('reject-property', $property), 403);
        AgencyKindGuard::ensureStandardForNonGlobal($request->user(), $property->agency_id);

        $property = $this->service->reject($property, $request->user(), $request->string('rejection_reason')->value());

        return $this->json(['data' => PropertyResource::make($property)->resolve($request)]);
    }

    /**
     * POST /api/admin/properties/{property}/resubmit
     */
    public function resubmit(Request $request, Property $property): JsonResponse
    {
        abort_unless($request->user()->can('resubmit-property', $property), 403);
        AgencyKindGuard::ensureStandardForNonGlobal($request->user(), $property->agency_id);

        $property = $this->service->resubmit($property, $request->user());

        return $this->json(['data' => PropertyResource::make($property)->resolve($request)]);
    }
}
