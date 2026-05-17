<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PropertyResource;
use App\Http\Resources\ReviewResource;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-177 + TCK-276 — public agent profile.
 *
 * `GET /api/public/agents/{slug}` returns the agent's contact card
 * (incl. bio, derived city, specialty, years_of_experience), the public
 * portfolio, derived stats, and approved reviews. Uses `User.username`
 * as the slug; only users in `active` status surface here.
 */
class PublicAgentController extends Controller
{
    public function show(Request $request, string $slug): JsonResponse
    {
        $agent = User::query()
            ->where('username', $slug)
            ->where('status', 'active')
            ->with(['agency', 'addresses', 'agentProfiles'])
            ->first();

        abort_if($agent === null, 404);

        $portfolioBase = fn () => Property::query()
            ->where('user_id', $agent->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public);

        $portfolio = $portfolioBase()
            ->with('address')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->limit(24)
            ->get();

        $rentCount = $portfolioBase()->where('contract_type', ContractType::Rent)->count();
        $saleCount = $portfolioBase()->where('contract_type', ContractType::Sale)->count();
        $portfolioTotal = $portfolioBase()->count();
        $citiesCount = $portfolioBase()
            ->join('addresses', function ($join) {
                $join->on('addresses.addressable_id', '=', 'properties.id')
                    ->where('addresses.addressable_type', '=', Property::class);
            })
            ->distinct()
            ->count('addresses.city');

        $profile = $agent->agency
            ? $agent->agentProfiles->firstWhere('agency_id', $agent->agency->id)
            : $agent->agentProfiles->first();

        $yearsOfExperience = null;
        if ($profile?->hire_date) {
            $diff = $profile->hire_date->diffInYears(now());
            $yearsOfExperience = (int) max(0, floor($diff));
        }

        $reviewsQuery = Review::query()
            ->where('reviewable_type', User::class)
            ->where('reviewable_id', $agent->id)
            ->where('is_approved', true);

        $reviewsCount = (clone $reviewsQuery)->count();
        $reviewsAverage = $reviewsCount > 0
            ? round((float) (clone $reviewsQuery)->avg('rating'), 1)
            : null;
        $reviewsRecent = $reviewsCount > 0
            ? (clone $reviewsQuery)->with('author')->latest()->limit(6)->get()
            : collect();

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
                'bio' => $agent->bio,
                'city' => $agent->addresses->first()?->city,
                'preferred_language' => $agent->preferred_language,
                'specialty' => $profile?->specialty,
                'years_of_experience' => $yearsOfExperience,
                'agency' => $agent->agency ? [
                    'id' => $agent->agency->id,
                    'name' => $agent->agency->name,
                    'slug' => $agent->agency->slug,
                ] : null,
                'stats' => [
                    'rent_count' => $rentCount,
                    'sale_count' => $saleCount,
                    'cities' => $citiesCount,
                    'years' => $yearsOfExperience,
                ],
                'portfolio_count' => $portfolio->count(),
                'portfolio_total' => $portfolioTotal,
                'portfolio' => PropertyResource::collection($portfolio)->toArray($request),
                'reviews' => [
                    'average' => $reviewsAverage,
                    'count' => $reviewsCount,
                    'recent' => ReviewResource::collection($reviewsRecent)->toArray($request),
                ],
            ],
        ]);
    }

    /**
     * TCK-276 — paginated portfolio for the public agent page (load-more).
     */
    public function properties(Request $request, string $slug)
    {
        $agent = User::query()
            ->where('username', $slug)
            ->where('status', 'active')
            ->first();

        abort_if($agent === null, 404);

        $perPage = min(max((int) $request->input('per_page', 24), 1), 48);

        $properties = Property::query()
            ->where('user_id', $agent->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public)
            ->with('address', 'media')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return PropertyResource::collection($properties);
    }
}
