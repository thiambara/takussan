<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\AgencyResource;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-144 — Agency moderation (super-admin only). The verify / suspend /
 * unverify lifecycle is mapped onto `AgencyStatus` because the data model
 * already carries `is_verified` + `verified_at` — no schema change.
 *
 *   verify   → status=Active,    is_verified=true,  verified_at=now()
 *   suspend  → status=Suspended  (verification flag preserved)
 *   unverify → status=Inactive,  is_verified=false, verified_at=null
 *
 * Each transition writes a `super_admin_agency_*` activity log entry tied to
 * the actor and the target agency.
 */
class AgencyModerationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Agency::query()->orderByDesc('created_at');

        if ($status = $request->string('filter.status')->trim()->value()) {
            if ($enum = AgencyStatus::tryFrom($status)) {
                $query->where('status', $enum);
            }
        }

        if ($search = $request->string('filter.search')->trim()->value()) {
            $query->where(function ($q) use ($search): void {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $perPage = (int) ($request->query('per_page') ?? 15);
        $agencies = $query->paginate($perPage > 0 ? min($perPage, 100) : 15);

        return $this->json([
            'data' => AgencyResource::collection($agencies)->resolve($request),
            'meta' => [
                'total' => $agencies->total(),
                'current_page' => $agencies->currentPage(),
                'last_page' => $agencies->lastPage(),
                'per_page' => $agencies->perPage(),
            ],
        ]);
    }

    public function verify(Request $request, Agency $agency): JsonResponse
    {
        return $this->transition($request, $agency, AgencyStatus::Active, 'super_admin_agency_verified', [
            'is_verified' => true,
            'verified_at' => now(),
        ]);
    }

    public function suspend(Request $request, Agency $agency): JsonResponse
    {
        return $this->transition($request, $agency, AgencyStatus::Suspended, 'super_admin_agency_suspended');
    }

    public function unverify(Request $request, Agency $agency): JsonResponse
    {
        return $this->transition($request, $agency, AgencyStatus::Inactive, 'super_admin_agency_unverified', [
            'is_verified' => false,
            'verified_at' => null,
        ]);
    }

    private function transition(
        Request $request,
        Agency $agency,
        AgencyStatus $next,
        string $event,
        array $extra = [],
    ): JsonResponse {
        $previous = $agency->status?->value;
        $agency->fill(['status' => $next] + $extra)->save();

        activity('Agency')
            ->performedOn($agency)
            ->causedBy($request->user())
            ->withProperties(['old_status' => $previous, 'new_status' => $next->value])
            ->event($event)
            ->log("Agency {$event}");

        return $this->json([
            'data' => (new AgencyResource($agency->refresh()))->resolve($request),
        ]);
    }
}
