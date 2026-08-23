<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\ReviewRentRequest;
use App\Http\Resources\LeaseResource;
use App\Models\Lease;
use App\Services\Lease\RentReviewService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Spatie\Activitylog\Models\Activity;

/**
 * TCK-091 — `PATCH /api/leases/{lease}/rent` and
 * `GET /api/leases/{lease}/rent-history` (read-only audit history).
 *
 * The dedicated PATCH path exists so every rent change is journaled; the
 * generic `LeaseController@update` rejects `monthly_rent` in payload and
 * points the caller here.
 */
class LeaseRentController extends Controller
{
    public function __construct(protected RentReviewService $service) {}

    public function update(ReviewRentRequest $request, Lease $lease): JsonResponse
    {
        $user = $request->user();
        abort_unless($user !== null && Gate::forUser($user)->allows('reviewRent', $lease), 403);

        $lease = $this->service->review($lease, $user, $request->validated());

        return $this->json([
            'data' => LeaseResource::make($lease->load(['property', 'tenant']))->toArray($request),
        ]);
    }

    public function index(Request $request, Lease $lease): JsonResponse
    {
        $user = $request->user();
        abort_unless($user !== null && Gate::forUser($user)->allows('reviewRent', $lease), 403);

        $perPage = max(1, min((int) $request->input('per_page', 20), 100));

        $paginator = Activity::query()
            ->where('subject_type', Lease::class)
            ->where('subject_id', $lease->id)
            ->where('event', 'lease_rent_reviewed')
            // Tie-break on `id` so two reviews logged within the same instant
            // still come out in insertion order. This cited "second precision
            // in MySQL/SQLite" until 2026-08-22 — both engines are gone
            // (ADR-0020) and PostgreSQL timestamps carry microseconds, so the
            // collision is far less likely. The tie-break stays: `ORDER BY` on
            // a non-unique column has no defined order for equal keys on ANY
            // engine, and that is the real reason.
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage);

        return $this->json([
            'data' => $paginator->getCollection()->map(fn (Activity $log) => [
                'id' => $log->id,
                'event' => $log->event,
                'old_rent' => isset($log->properties['old_rent']) ? (float) $log->properties['old_rent'] : null,
                'new_rent' => isset($log->properties['new_rent']) ? (float) $log->properties['new_rent'] : null,
                'reason' => $log->properties['reason'] ?? null,
                'effective_date' => $log->properties['effective_date'] ?? null,
                'variation_pct' => isset($log->properties['variation_pct']) ? (float) $log->properties['variation_pct'] : null,
                'forced' => (bool) ($log->properties['forced'] ?? false),
                'causer_id' => $log->causer_id,
                'causer_type' => $log->causer_type,
                'created_at' => $log->created_at?->toISOString(),
            ])->all(),
            'meta' => $this->paginationMeta($paginator),
        ]);
    }
}
