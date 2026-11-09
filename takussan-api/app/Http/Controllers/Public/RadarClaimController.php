<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Public\ConfirmRadarClaimRequest;
use App\Http\Requests\Public\DeclineRadarClaimRequest;
use App\Http\Requests\Public\RequestRadarClaimOtpRequest;
use App\Models\User;
use App\Services\Radar\ClaimDecline;
use App\Services\Radar\ClaimLinks;
use App\Services\Radar\RadarClaims;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2390 (ADR-0077 §3) — la page publique de réclamation, `/{locale}/claim/{jeton}`, pour l'annonceur qui préfère vérifier
 * lui-même : lire ses annonces, recevoir un code à SON numéro, confirmer. Sans `auth` : le lien signé est l'autorisation
 * ({@see ClaimLinks}), et la session du navigateur, s'il y en a une, n'est lue que pour le titulaire déjà inscrit du numéro.
 *
 * Le contrôleur ne décide rien : {@see RadarClaims}.
 */
class RadarClaimController extends Controller
{
    public function __construct(private readonly ClaimLinks $links, private readonly RadarClaims $claims) {}

    public function show(Request $request, string $token): JsonResponse
    {
        RadarClaims::ensureAvailable();

        return $this->json(['data' => $this->claims->show($this->links->resolve($token), $this->viewer($request))]);
    }

    public function otp(RequestRadarClaimOtpRequest $request, string $token): JsonResponse
    {
        RadarClaims::ensureAvailable();
        $data = $this->claims->sendCode($this->links->resolve($token), $this->viewer($request), app()->getLocale());

        return $this->json(['message' => __('auth.phone.code_sent'), 'data' => $data], 202);
    }

    public function confirm(ConfirmRadarClaimRequest $request, string $token): JsonResponse
    {
        RadarClaims::ensureAvailable();

        return $this->claims->confirm($this->links->resolve($token), $request->validated(), $this->viewer($request), app()->getLocale());
    }

    /**
     * TCK-2511 — « Ce n'est pas moi » / « Ne plus me contacter » : l'effet d'un STOP ({@see ClaimDecline}). Délibérément
     * HORS de {@see RadarClaims::ensureAvailable()} : le droit d'opposition ne se ferme pas avec la connexion par téléphone.
     * Un lien mort rend ce que rendent les autres routes (404 `radar.claim.invalid`, 410 `expired` / `revoked`).
     */
    public function decline(DeclineRadarClaimRequest $request, string $token, ClaimDecline $decline): JsonResponse
    {
        $decline->decline($this->links->resolve($token), (string) $request->validated('reason'));

        return $this->json(['data' => ['status' => 'declined']]);
    }

    private function viewer(Request $request): ?User
    {
        $user = $request->user() ?? $request->user('sanctum');

        return $user instanceof User ? $user : null;
    }
}
