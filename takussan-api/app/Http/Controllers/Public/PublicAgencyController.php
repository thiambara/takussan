<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PropertyResource;
use App\Http\Resources\ReviewResource;
use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-177 + TCK-276 — public agency profile.
 *
 * `GET /api/public/agencies/{slug}` returns the agency contact card,
 * its agents (enriched with specialty + portfolio_count), the public
 * portfolio, derived stats, and approved reviews.
 */
class PublicAgencyController extends Controller
{
    public function show(Request $request, string $slug): JsonResponse
    {
        $agency = Agency::query()
            ->where('slug', $slug)
            ->with('addresses')
            ->first();

        abort_if($agency === null, 404);

        // Base query (non limitée) — sert aux stats globales.
        $portfolioBase = fn () => Property::query()
            ->where('agency_id', $agency->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public);

        $portfolio = $portfolioBase()
            ->with('address')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->limit(48)
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

        // TCK-276 — l'équipe publique combine 3 sources dédupliquées :
        //   1. AgentProfile (staff agent officiel)
        //   2. AgencyAdminProfile (admin agence — publie aussi)
        //   3. Publishers de biens publics (Property.user_id) — typiquement
        //      des OwnerProfile (TCK-142 — Property.user_id = bailleur), mais
        //      affichés comme contact côté fiche bien donc attendus dans
        //      l'équipe pour la cohérence du parcours.
        $agentUserIds = AgentProfile::query()
            ->where('agency_id', $agency->id)
            ->pluck('user_id');

        $adminUserIds = AgencyAdminProfile::query()
            ->where('agency_id', $agency->id)
            ->pluck('user_id');

        $publisherUserIds = Property::query()
            ->where('agency_id', $agency->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public)
            ->distinct()
            ->pluck('user_id');

        $teamUserIds = $agentUserIds
            ->merge($adminUserIds)
            ->merge($publisherUserIds)
            ->filter()
            ->unique()
            ->values();

        $portfolioCounts = $teamUserIds->isEmpty()
            ? collect()
            : Property::query()
                ->where('agency_id', $agency->id)
                ->where('status', PropertyStatus::Available)
                ->where('visibility', PropertyVisibility::Public)
                ->whereIn('user_id', $teamUserIds)
                ->selectRaw('user_id, COUNT(*) as cnt')
                ->groupBy('user_id')
                ->pluck('cnt', 'user_id');

        $agents = $teamUserIds->isEmpty()
            ? collect()
            : User::query()
                ->whereIn('id', $teamUserIds)
                ->where('status', UserStatus::Active)
                ->with(['agentProfiles' => fn ($q) => $q->where('agency_id', $agency->id)])
                ->get()
                ->map(function (User $u) use ($portfolioCounts) {
                    $profile = $u->agentProfiles->first();

                    return [
                        'id' => $u->id,
                        'slug' => $u->username,
                        'full_name' => trim($u->first_name.' '.$u->last_name),
                        // Personal email of each team member is PII and was being
                        // exposed on an unauthenticated, slug-enumerable endpoint —
                        // a turnkey harvesting vector. Contact happens via the agency
                        // business email/phone below, not individual agents.
                        'avatar_url' => $u->avatar_url ?? null,
                        'specialty' => $profile?->specialty,
                        'portfolio_count' => (int) ($portfolioCounts[$u->id] ?? 0),
                    ];
                })
                ->sortByDesc('portfolio_count')
                ->values();

        $reviewsQuery = Review::query()
            ->where('reviewable_type', Agency::class)
            ->where('reviewable_id', $agency->id)
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
                'id' => $agency->id,
                'slug' => $agency->slug,
                'name' => $agency->name,
                'description' => $agency->description,
                'license_number' => $agency->license_number,
                'logo_url' => $agency->logo_url ?? null,
                'email' => $agency->email,
                'phone' => $agency->phone,
                'city' => $agency->addresses->first()?->city,
                'stats' => [
                    'rent_count' => $rentCount,
                    'sale_count' => $saleCount,
                    'cities' => $citiesCount,
                    'agents' => $agents->count(),
                ],
                'agents' => $agents,
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
     * TCK-276 — paginated portfolio for the public agency page (load-more).
     */
    public function properties(Request $request, string $slug)
    {
        $agency = Agency::query()->where('slug', $slug)->first();

        abort_if($agency === null, 404);

        $perPage = min(max((int) $request->input('per_page', 24), 1), 48);

        $properties = Property::query()
            ->where('agency_id', $agency->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public)
            ->with('address', 'media')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return PropertyResource::collection($properties);
    }
}
