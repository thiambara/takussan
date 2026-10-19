<?php

namespace App\Http\Controllers;

use App\Domain\Features\Flag;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Onboarding\HostAutoOnboardRequest;
use App\Services\Onboarding\HostIndividualOnboardingService;
use App\Services\Profiles\ActiveProfileResolver;
use App\Support\Feature;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * TCK-633 (lot C) — « Publier » sans assistant : l'espace individuel naît sans question.
 *
 * Derrière `host_auto_space` : éteint, 403 `onboarding.auto_space_disabled`, et le front reprend
 * l'assistant actuel, intact (le serveur arbitre, le front n'a pas à lire le drapeau). Idempotent :
 * 201 à la création, 200 pour l'espace existant. Pose le cookie du profil actif comme
 * {@see HostOnboardingController::individual()}.
 */
class HostAutoOnboardController extends Controller
{
    public function __construct(
        private readonly HostIndividualOnboardingService $service,
        private readonly ActiveProfileResolver $resolver,
    ) {}

    public function store(HostAutoOnboardRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_code_unless(Feature::isEnabled(Flag::HostAutoSpace->value, $user), 403, 'onboarding.auto_space_disabled');

        // TCK-966 (P47.07) — `primary_city` reste accepté et validé, mais n'est plus enregistré.
        $result = $this->service->autoOnboard($user);
        $compositeId = $this->resolver->compositeId($result['active_profile']);

        return $this->json([
            'data' => [
                'created' => $result['created'],
                'agency' => [
                    'id' => $result['agency']->id,
                    'name' => $result['agency']->name,
                    'slug' => $result['agency']->slug,
                    'kind' => $result['agency']->kind->value,
                    'status' => $result['agency']->status->value,
                ],
                'active_profile_id' => $compositeId,
            ],
        ], $result['created'] ? 201 : 200)->withCookie(Cookie::create(
            name: 'active_profile_id',
            value: $compositeId,
            expire: now()->addDays(30)->getTimestamp(),
            path: '/',
            domain: null,
            secure: (bool) config('session.secure', false),
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        ));
    }
}
