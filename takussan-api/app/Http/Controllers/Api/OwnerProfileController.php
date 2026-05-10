<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Policies\OwnerProfilePolicy;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-256 — read-only listing of OwnerProfile rows scoped to the
 * actor's active agency.
 *
 * Spatie/laravel-query-builder takes care of:
 *  - sparse fieldsets (`fields[owner_profiles]=...`)
 *  - filters (`filter[status]=draft|active|...`, `filter[search]=...`)
 *  - includes (`include=user`)
 *  - sort (`sort=-created_at`)
 *
 * The listing is intentionally a *flat* JSON envelope (no resource
 * wrapper) because the model already exposes only the columns the front
 * has asked for via `fields[]`. Visibility is gated by
 * {@see OwnerProfilePolicy::viewAny()}.
 */
class OwnerProfileController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('viewAny', OwnerProfile::class)) {
            throw new AuthorizationException;
        }

        $base = $this->visibleScope($user, $request);
        $paginator = OwnerProfile::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => $paginator->items(),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
            ],
            'links' => [
                'first' => $paginator->url(1),
                'last' => $paginator->url($paginator->lastPage()),
                'prev' => $paginator->previousPageUrl(),
                'next' => $paginator->nextPageUrl(),
            ],
        ]);
    }

    /**
     * super_admin sees everything; agency-side roles see their agency
     * only; everyone else sees nothing (defensive — `viewAny` already
     * filters out non-agency roles).
     */
    protected function visibleScope(User $user, Request $request): Builder
    {
        if ($user->isSuperAdmin()) {
            return OwnerProfile::query();
        }

        $agencyId = $user->agency_id;

        return OwnerProfile::query()->where('agency_id', $agencyId);
    }
}
