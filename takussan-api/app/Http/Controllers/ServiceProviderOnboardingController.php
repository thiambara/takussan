<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Models\Profiles\ServiceProviderProfile;
use App\Services\Onboarding\ServiceProviderOnboardingService;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * TCK-261 — exposes `POST /api/service-provider/onboard/complete`.
 *
 * Auth-gated (sanctum). Body : `{sp_profile_id, phone_otp:{code}}`.
 *
 * Side-effects:
 *  - SP profile flipped to `active` (if not already) + paused
 *    collaborations bumped to `active`,
 *  - `active_profile_id` cookie set to point at the SP (mirrors
 *    {@see Api\Me\MeProfilesController::updateActive()}),
 *  - activity log entries (`sp_phone_verified`, `sp_onboarding_completed`).
 */
class ServiceProviderOnboardingController extends Controller
{
    public function __construct(
        private readonly ServiceProviderOnboardingService $service,
        private readonly ActiveProfileResolver $resolver,
    ) {}

    public function complete(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        $validated = $request->validate([
            'sp_profile_id' => ['required', 'integer'],
            'phone_otp' => ['nullable', 'array'],
            'phone_otp.code' => ['nullable', 'string', 'size:6'],
        ]);

        $sp = ServiceProviderProfile::query()
            ->whereKey((int) $validated['sp_profile_id'])
            ->where('user_id', $user->id)
            ->first();

        abort_if($sp === null, 403, __('service_providers.onboarding.errors.not_owner'));

        $result = $this->service->complete($sp, $user, $validated);

        $compositeId = $this->resolver->compositeId($result['sp_profile']);

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
                'sp_profile' => [
                    'id' => $result['sp_profile']->id,
                    'status' => $result['sp_profile']->status->value,
                ],
                'active_profile_id' => $compositeId,
                'activated_collaborations' => $result['activated_collaborations'],
                'redirect_to_maintenance_request_id' => $result['redirect_to_maintenance_request_id'],
            ],
        ], 200)->withCookie($cookie);
    }
}
