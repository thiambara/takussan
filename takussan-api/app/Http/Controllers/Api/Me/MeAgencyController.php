<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Controllers\HostAutoOnboardController;
use App\Http\Requests\Api\Me\StoreOwnAgencyRequest;
use App\Services\Onboarding\OwnAgencyOpeningService;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * TCK-2937 (ADR-0125) — `POST /api/me/agencies` : « Créer mon espace pro » depuis l'orientation.
 *
 * 201 `{ data: { agency, kyc_dossier, active_profile_id } }` et le cookie du profil actif, comme
 * {@see HostAutoOnboardController}. Les refus sont ceux du service :
 * 409 `agency.already_admin`, 422 `agency.ninea_taken`. Aucune policy : l'acte porte sur le compte
 * appelant lui-même, et la seule règle (pas déjà admin d'une agence) se juge sous verrou dans le
 * service.
 */
class MeAgencyController extends Controller
{
    public function __construct(
        private readonly OwnAgencyOpeningService $service,
        private readonly ActiveProfileResolver $resolver,
    ) {}

    public function store(StoreOwnAgencyRequest $request): JsonResponse
    {
        $result = $this->service->open($request->user(), $request->validated());
        $agency = $result['agency'];
        $compositeId = $this->resolver->compositeId($result['agency_admin_profile']);

        return $this->json([
            'data' => [
                'agency' => [
                    'id' => $agency->id,
                    'name' => $agency->name,
                    'slug' => $agency->slug,
                    'kind' => $agency->kind->value,
                    'status' => $agency->status->value,
                    'is_verified' => (bool) $agency->is_verified,
                ],
                'kyc_dossier' => [
                    'id' => $result['kyc_dossier']->id,
                    'status' => $result['kyc_dossier']->status->value,
                ],
                'active_profile_id' => $compositeId,
            ],
        ], 201)->withCookie(Cookie::create(
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
