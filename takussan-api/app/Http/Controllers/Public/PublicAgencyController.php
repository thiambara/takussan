<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PropertyResource;
use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-177 — public agency profile.
 *
 * `GET /api/public/agencies/{slug}` returns the agency contact card,
 * its agents, and the public portfolio of properties.
 */
class PublicAgencyController extends Controller
{
    public function show(Request $request, string $slug): JsonResponse
    {
        $agency = Agency::query()
            ->where('slug', $slug)
            ->first();

        abort_if($agency === null, 404);

        $portfolio = Property::query()
            ->where('agency_id', $agency->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public)
            ->latest()
            ->limit(48)
            ->get();

        $agentUserIds = AgentProfile::query()
            ->where('agency_id', $agency->id)
            ->pluck('user_id');

        $agents = User::query()
            ->whereIn('id', $agentUserIds)
            ->where('status', 'active')
            ->get()
            ->map(fn ($u) => [
                'id' => $u->id,
                'slug' => $u->username,
                'full_name' => trim($u->first_name.' '.$u->last_name),
                'avatar_url' => $u->avatar_url ?? null,
            ])
            ->values();

        return $this->json([
            'data' => [
                'id' => $agency->id,
                'slug' => $agency->slug,
                'name' => $agency->name,
                'description' => $agency->description,
                'license_number' => $agency->license_number,
                'logo_url' => $agency->logo_url ?? null,
                'agents' => $agents,
                'portfolio_count' => $portfolio->count(),
                'portfolio' => PropertyResource::collection($portfolio)->toArray($request),
            ],
        ]);
    }
}
