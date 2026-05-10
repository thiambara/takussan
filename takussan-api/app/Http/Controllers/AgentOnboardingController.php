<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Models\Profiles\AgentProfile;
use App\Services\Onboarding\AgentOnboardingService;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * TCK-259 — exposes `POST /api/agent/onboard/complete`.
 *
 * Auth-gated (sanctum). Body : `{agent_profile_id, phone_otp:{code}}`.
 *
 * Side-effects :
 *  - AgentProfile flipped to `active` (if not already),
 *  - `active_profile_id` cookie set to point at the Agent (mirrors
 *    {@see Api\Me\MeProfilesController::updateActive()}),
 *  - Activity log entries (`agent_phone_verified`, `agent_onboarding_completed`).
 */
class AgentOnboardingController extends Controller
{
    public function __construct(
        private readonly AgentOnboardingService $service,
        private readonly ActiveProfileResolver $resolver,
    ) {}

    public function complete(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        $validated = $request->validate([
            'agent_profile_id' => ['required', 'integer'],
            'phone_otp' => ['nullable', 'array'],
            'phone_otp.code' => ['nullable', 'string', 'size:6'],
        ]);

        $agent = AgentProfile::query()
            ->whereKey((int) $validated['agent_profile_id'])
            ->where('user_id', $user->id)
            ->first();

        abort_if($agent === null, 403, __('team.onboarding.errors.not_owner'));

        $result = $this->service->complete($agent, $user, $validated);

        $compositeId = $this->resolver->compositeId($result['agent_profile']);

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
                'agent_profile' => [
                    'id' => $result['agent_profile']->id,
                    'status' => $result['agent_profile']->status->value,
                ],
                'active_profile_id' => $compositeId,
                'first_lead' => $result['first_lead'],
            ],
        ], 200)->withCookie($cookie);
    }
}
