<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Me\SelectActiveProfileRequest;
use App\Http\Resources\Api\Me\ProfileResource;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Services\Profiles\ActiveProfileResolver;
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
        $profiles = $user->profiles();

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
