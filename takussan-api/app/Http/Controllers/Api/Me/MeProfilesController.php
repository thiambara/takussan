<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Me\SelectActiveProfileRequest;
use App\Http\Resources\Api\Me\ProfileResource;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

class MeProfilesController extends Controller
{
    public function __construct(private readonly ActiveProfileResolver $resolver) {}

    /**
     * `GET /api/me/profiles` — every profile owned by the authenticated user,
     * across the four concrete profile types. Always scoped to the caller —
     * a user can never list someone else's profiles via this endpoint.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->load([
            'ownerProfiles.agency',
            'agentProfiles.agency',
            'agencyAdminProfiles.agency',
            'brokerProfile',
            'serviceProviderProfile',
        ]);
        // Filter out non-Active profiles before exposing them to the client.
        // Stale/suspended profiles would otherwise clutter the switcher and
        // let the user pick a context the policy layer immediately rejects.
        // Broker has no status enum — always include.
        $profiles = $user->profiles()->filter(fn (Model $p) => $this->isActive($p))->values();

        $active = $request->activeProfile();
        $activeId = $active !== null ? $this->resolver->compositeId($active) : null;

        return $this->json([
            'data' => ProfileResource::collection($profiles)->resolve($request),
            'meta' => [
                'active_profile_id' => $activeId,
                'count' => $profiles->count(),
            ],
        ]);
    }

    private function isActive(Model $profile): bool
    {
        return match (true) {
            $profile instanceof OwnerProfile => $profile->status === OwnerProfileStatus::Active,
            $profile instanceof AgentProfile => $profile->status === AgentProfileStatus::Active,
            $profile instanceof AgencyAdminProfile => $profile->status === AgencyAdminProfileStatus::Active,
            $profile instanceof ServiceProviderProfile => $profile->status === ServiceProviderProfileStatus::Active,
            $profile instanceof BrokerProfile => true,
            default => true,
        };
    }

    /**
     * `PATCH /api/me/active-profile` — set the active profile for the session.
     * Persists an httpOnly cookie so subsequent requests inherit the choice
     * without re-sending the header. Returns 403 if the requested profile
     * isn't owned by the caller.
     */
    public function updateActive(SelectActiveProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $composite = (string) $request->input('profile_id');

        $profile = $this->resolver->resolve($composite, $user);
        if ($profile === null) {
            return $this->json(['message' => 'Profile not accessible.'], 403);
        }

        $cookie = Cookie::create(
            name: 'active_profile_id',
            value: $this->resolver->compositeId($profile),
            expire: now()->addDays(30)->getTimestamp(),
            path: '/',
            domain: null,
            secure: (bool) config('session.secure', false),
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        );

        if ($profile instanceof OwnerProfile
            || $profile instanceof AgentProfile
            || $profile instanceof AgencyAdminProfile) {
            $profile->loadMissing('agency');
        }

        return $this->json([
            'data' => (new ProfileResource($profile))->resolve($request),
        ])->withCookie($cookie);
    }
}
