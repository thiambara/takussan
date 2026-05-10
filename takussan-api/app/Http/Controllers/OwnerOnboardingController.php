<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Models\Profiles\OwnerProfile;
use App\Services\Onboarding\OwnerOnboardingService;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * TCK-257 — exposes `POST /api/owner/onboard/complete`.
 *
 * Auth-gated (sanctum). Body : `{owner_profile_id, phone_otp:{code}}`.
 *
 * Side-effects :
 *  - OwnerProfile flipped to `active` (if not already),
 *  - `active_profile_id` cookie set to point at the Owner (mirrors
 *    {@see Api\Me\MeProfilesController::updateActive()}),
 *  - Activity log entries (`owner_phone_verified`, `owner_onboarding_completed`).
 */
class OwnerOnboardingController extends Controller
{
    public function __construct(
        private readonly OwnerOnboardingService $service,
        private readonly ActiveProfileResolver $resolver,
    ) {}

    public function complete(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        $validated = $request->validate([
            'owner_profile_id' => ['required', 'integer'],
            'phone_otp' => ['nullable', 'array'],
            'phone_otp.code' => ['nullable', 'string', 'size:6'],
        ]);

        $owner = OwnerProfile::query()
            ->whereKey((int) $validated['owner_profile_id'])
            ->where('user_id', $user->id)
            ->first();

        abort_if($owner === null, 403, __('owners.onboarding.errors.not_owner'));

        $result = $this->service->complete($owner, $user, $validated);

        $compositeId = $this->resolver->compositeId($result['owner_profile']);

        $cookie = Cookie::create(
            name: 'active_profile_id',
            value: $compositeId,
            expire: now()->addDays(30)->getTimestamp(),
            path: '/',
            domain: null,
            secure: (bool) config('session.secure', false),
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        );

        return response()->json([
            'data' => [
                'owner_profile' => [
                    'id' => $result['owner_profile']->id,
                    'status' => $result['owner_profile']->status->value,
                ],
                'active_profile_id' => $compositeId,
                'properties_count' => $result['properties_count'],
            ],
        ], 200)->withCookie($cookie);
    }
}
