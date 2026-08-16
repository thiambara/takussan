<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-258 — `GET /api/agencies/{agency}/team`.
 *
 * Returns the AgentProfiles attached to the agency (active members +
 * pending drafts), plus — via the optional `include=user` — the user
 * row that carries display name and email. Soft-deleted (removed)
 * profiles are excluded by default.
 *
 * TCK-278 — the user row no longer carries a "role assignment": the
 * membership IS the `AgentProfile` returned here. `spatie/laravel-permission`
 * is uninstalled (ADR-0002). Only `spatie/laravel-query-builder` remains,
 * and it is what the next paragraph is about.
 *
 * Spatie/laravel-query-builder takes care of:
 *  - sparse fieldsets (`fields[agent_profiles]=...`)
 *  - filters (`filter[status]=draft|active|suspended`, `filter[search]=...`)
 *  - includes (`include=user`)
 *  - sort (`sort=-created_at`)
 */
class TeamController extends Controller
{
    public function index(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('viewAny', [AgentProfile::class, $agency])) {
            throw new AuthorizationException(__('team.errors.forbidden'));
        }

        $base = AgentProfile::query()->where('agency_id', $agency->id);

        $paginator = AgentProfile::buildQuery($base, $request)
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
}
