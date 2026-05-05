<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PropertyResource;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-177 — public agent profile.
 *
 * `GET /api/public/agents/{slug}` returns the agent's contact card and
 * portfolio of public properties. Uses `User.username` as the slug; only
 * users in `active` status with at least one public property surface
 * here.
 */
class PublicAgentController extends Controller
{
    public function show(Request $request, string $slug): JsonResponse
    {
        $agent = User::query()
            ->where('username', $slug)
            ->where('status', 'active')
            ->with('agency')
            ->first();

        abort_if($agent === null, 404);

        $portfolio = Property::query()
            ->where('user_id', $agent->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public)
            ->latest()
            ->limit(24)
            ->get();

        return $this->json([
            'data' => [
                'id' => $agent->id,
                'slug' => $agent->username,
                'first_name' => $agent->first_name,
                'last_name' => $agent->last_name,
                'full_name' => trim($agent->first_name.' '.$agent->last_name),
                'email' => $agent->email,
                'phone' => $agent->phone,
                'avatar_url' => $agent->avatar_url ?? null,
                'agency' => $agent->agency ? [
                    'id' => $agent->agency->id,
                    'name' => $agent->agency->name,
                    'slug' => $agent->agency->slug,
                ] : null,
                'portfolio_count' => $portfolio->count(),
                'portfolio' => PropertyResource::collection($portfolio)->toArray($request),
            ],
        ]);
    }
}
