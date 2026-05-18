<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Api\Me\MeProfilesController;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Onboarding\HostIndividualOnboardRequest;
use App\Services\Onboarding\HostIndividualOnboardingService;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * TCK-255 — exposes the host individual onboarding endpoint.
 *
 * The endpoint is auth-gated (sanctum) and creates everything in a single
 * transaction. After success, sets the `active_profile_id` cookie so the
 * subsequent navigation lands the user in their freshly-minted agency
 * context (mirrors {@see MeProfilesController::updateActive()}).
 */
class HostOnboardingController extends Controller
{
    public function __construct(
        private readonly HostIndividualOnboardingService $service,
        private readonly ActiveProfileResolver $resolver,
    ) {}

    public function individual(HostIndividualOnboardRequest $request): JsonResponse
    {
        $result = $this->service->onboard($request->user(), $request->validated());

        $compositeId = $this->resolver->compositeId($result['active_profile']);

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
                'agency' => [
                    'id' => $result['agency']->id,
                    'name' => $result['agency']->name,
                    'slug' => $result['agency']->slug,
                    'kind' => $result['agency']->kind->value,
                    'status' => $result['agency']->status->value,
                ],
                'profiles' => [
                    'agency_admin' => [
                        // TCK-271 — concrete `AgencyAdminProfile` is now
                        // materialized in the same transaction as the agency
                        // and pinned as the active context cookie below.
                        // The `role` key is preserved for back-compat with
                        // earlier wizard payloads — the spatie role attachment
                        // is still the source of truth for permission checks.
                        'id' => $result['agency_admin_profile']->id,
                        'role' => 'agency_admin',
                        'agency_id' => $result['agency_admin_profile']->agency_id,
                        'status' => $result['agency_admin_profile']->status->value,
                    ],
                    'owner' => [
                        'id' => $result['owner_profile']->id,
                        'agency_id' => $result['owner_profile']->agency_id,
                        'status' => $result['owner_profile']->status->value,
                    ],
                ],
                // No `property_draft` block anymore — the wizard now
                // routes the user to `/app/properties/new` after onboarding
                // instead of bundling the first listing inline.
                'active_profile_id' => $compositeId,
            ],
        ], 201)->withCookie($cookie);
    }
}
