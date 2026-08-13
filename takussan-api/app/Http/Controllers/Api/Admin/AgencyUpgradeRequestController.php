<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Admin\ApproveAgencyUpgradeRequest;
use App\Http\Requests\Admin\RejectAgencyUpgradeRequest;
use App\Http\Resources\AgencyUpgradeRequestResource;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Services\Agency\AgencyUpgradeReviewService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-268 — super-admin console for the agency `individual → standard`
 * upgrade workflow.
 *
 *   GET   /api/admin/agency-upgrade-requests              → index
 *   GET   /api/admin/agency-upgrade-requests/pending-count → pendingCount
 *   GET   /api/admin/agency-upgrade-requests/{id}         → show
 *   POST  /api/admin/agency-upgrade-requests/{id}/approve → approve
 *   POST  /api/admin/agency-upgrade-requests/{id}/reject  → reject
 *
 * Mounted behind `auth:sanctum` + the `super-admin` middleware — every
 * action assumes the caller is a super_admin, no per-method gating.
 *
 * Listing uses spatie/laravel-query-builder so the FE can drive filters
 * (`filter[status]`, date range) + sparse fieldsets + relation includes
 * without bespoke endpoints.
 */
class AgencyUpgradeRequestController extends Controller
{
    public function __construct(private readonly AgencyUpgradeReviewService $service) {}

    public function index(Request $request): JsonResponse
    {
        $base = AgencyUpgradeRequest::query();

        // Custom date-range filters on `submitted_at` — outside the model's
        // generic filterables because we need >= / <= semantics here.
        if ($from = $request->string('filter.submitted_from')->trim()->value()) {
            $base->whereDate('submitted_at', '>=', $from);
        }
        if ($to = $request->string('filter.submitted_to')->trim()->value()) {
            $base->whereDate('submitted_at', '<=', $to);
        }

        $paginator = AgencyUpgradeRequest::buildQuery($base, $request)
            ->defaultSort('-submitted_at')
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => AgencyUpgradeRequestResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
            ],
        ]);
    }

    /**
     * GET /api/admin/agency-upgrade-requests/pending-count
     *
     * Lightweight endpoint feeding the sidebar badge — kept out of the
     * paginated listing so the layout can poll it without dragging the
     * full result set across the wire.
     */
    public function pendingCount(): JsonResponse
    {
        return $this->json([
            'count' => AgencyUpgradeRequest::query()->pending()->count(),
        ]);
    }

    public function show(Request $request, AgencyUpgradeRequest $upgradeRequest): JsonResponse
    {
        $upgradeRequest->load(['agency', 'submitter', 'reviewer', 'documents']);

        $agency = $upgradeRequest->agency;
        $propertiesCount = $agency
            ? $agency->properties()->count()
            : 0;
        $otherRequestsCount = AgencyUpgradeRequest::query()
            ->where('agency_id', $upgradeRequest->agency_id)
            ->where('id', '!=', $upgradeRequest->id)
            ->count();

        return $this->json([
            'data' => array_merge(
                AgencyUpgradeRequestResource::make($upgradeRequest)->toArray($request),
                [
                    'agency' => $agency ? [
                        'id' => $agency->id,
                        'name' => $agency->name,
                        'slug' => $agency->slug,
                        'kind' => $agency->kind?->value ?? (string) $agency->kind,
                        'status' => $agency->status?->value ?? (string) $agency->status,
                        'created_at' => $agency->created_at?->toIso8601String(),
                    ] : null,
                    'submitter' => $upgradeRequest->submitter ? [
                        'id' => $upgradeRequest->submitter->id,
                        'first_name' => $upgradeRequest->submitter->first_name,
                        'last_name' => $upgradeRequest->submitter->last_name,
                        'email' => $upgradeRequest->submitter->email,
                    ] : null,
                    'reviewer' => $upgradeRequest->reviewer ? [
                        'id' => $upgradeRequest->reviewer->id,
                        'first_name' => $upgradeRequest->reviewer->first_name,
                        'last_name' => $upgradeRequest->reviewer->last_name,
                        'email' => $upgradeRequest->reviewer->email,
                    ] : null,
                    'documents' => $upgradeRequest->documents->map(fn ($doc) => [
                        'id' => $doc->id,
                        'name' => $doc->name,
                        'type' => $doc->type?->value ?? (string) $doc->type,
                        'media_url' => optional($doc->getFirstMedia('file'))->getFullUrl(),
                    ])->all(),
                    'counts' => [
                        'properties' => $propertiesCount,
                        'other_requests' => $otherRequestsCount,
                    ],
                ],
            ),
        ]);
    }

    public function approve(
        ApproveAgencyUpgradeRequest $request,
        AgencyUpgradeRequest $upgradeRequest,
    ): JsonResponse {
        $reviewer = $request->user();
        abort_if($reviewer === null, 401);

        $approved = $this->service->approve(
            $upgradeRequest,
            $reviewer,
            $request->input('comment'),
        );

        return $this->json(
            ['data' => AgencyUpgradeRequestResource::make($approved)->toArray($request)],
            200,
        );
    }

    public function reject(
        RejectAgencyUpgradeRequest $request,
        AgencyUpgradeRequest $upgradeRequest,
    ): JsonResponse {
        $reviewer = $request->user();
        abort_if($reviewer === null, 401);

        $rejected = $this->service->reject(
            $upgradeRequest,
            $reviewer,
            (string) $request->input('comment'),
        );

        return $this->json(
            ['data' => AgencyUpgradeRequestResource::make($rejected)->toArray($request)],
            200,
        );
    }

    /**
     * Helper used by the FE listing filter dropdown via
     * the existing `enums` endpoint pattern. Left as a static accessor in
     * case TCK-269 follow-ups need the same shape.
     *
     * @return array<int,string>
     */
    public static function statuses(): array
    {
        return array_map(
            fn (AgencyUpgradeRequestStatus $case) => $case->value,
            AgencyUpgradeRequestStatus::cases(),
        );
    }
}
