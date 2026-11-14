<?php

namespace App\Services\Invitation;

use App\Exceptions\ApiError;
use App\Http\Resources\InvitationResource;
use App\Http\Resources\UserResource;
use App\Models\Invitation;
use App\Services\Auth\PhoneLoginService;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2610 (ADR-0094 § 5) — l'invité entre comme on entre partout dans Takussan : un numéro, un code, sans mot de passe.
 *
 *  - L'envoi est celui de la connexion par téléphone ({@see PhoneLoginService::requestCode()}) : même portée, même verrou,
 *    même borne par numéro, même réponse qu'un compte existe ou non pour ce numéro (aucune énumération).
 *  - La vérification est celle de la connexion ({@see PhoneLoginService::authenticate()}) — verrou du numéro lu d'abord,
 *    second facteur exigé sans consommer le code, compte créé au numéro vérifié s'il n'y en a pas —, puis l'acceptation
 *    pour le compte ouvert ({@see InvitationService::acceptByVerifiedPhone()}). Le tout dans UNE transaction : un refus de
 *    l'acceptation (401 `requires_login`, 403, 409, 410) défait le compte créé et la session émise. Le compte qui porte
 *    l'e-mail de l'invitation ne se juge qu'APRÈS le code : avant, la réponse dirait si un numéro saisi est le sien.
 */
class InvitationCodeAcceptance
{
    public function __construct(
        private readonly PhoneLoginService $login,
        private readonly InvitationService $invitations,
        private readonly PhoneVerificationService $codes,
    ) {}

    /** @return array{retry_after: int} */
    public function sendCode(string $phone, ?string $locale): array
    {
        $this->login->requestCode($phone, $locale);

        return ['retry_after' => $this->codes->sendToAvailableIn(PhoneLoginService::SCOPE, $phone) ?: $this->codes->retryAfter()];
    }

    /**
     * @param  array{code: string, first_name?: ?string, last_name?: ?string, two_factor_code?: ?string, recovery_code?: ?string, device_name?: ?string, terms_version?: ?string}  $input
     */
    public function verify(Invitation $invitation, string $phone, array $input, Request $request): JsonResponse
    {
        // TCK-1344 — un compte qui naît de l'invitation garde la langue dans laquelle elle est partie.
        $locale = (string) (data_get($invitation->metadata, 'locale') ?: app()->getLocale());
        $proof = array_intersect_key($input, array_flip(['two_factor_code', 'recovery_code', 'device_name', 'terms_version']));

        try {
            return DB::transaction(function () use ($invitation, $phone, $input, $proof, $locale, $request): JsonResponse {
                $outcome = $this->login->authenticate($phone, (string) $input['code'], $proof, $locale);
                if ($outcome instanceof JsonResponse) {
                    return $outcome;
                }

                $accepted = $this->invitations->acceptByVerifiedPhone($invitation, $outcome['user'], [
                    'first_name' => $input['first_name'] ?? null,
                    'last_name' => $input['last_name'] ?? null,
                ]);

                // La réponse de `auth/phone/verify-code`, le compte relu APRÈS l'acceptation (nom, e-mail, profil), et l'invitation.
                return new JsonResponse([
                    'user' => UserResource::pourSoi($outcome['user']->fresh())->resolve($request),
                    'invitation' => InvitationResource::make($accepted)->resolve($request),
                ] + $outcome['response']->getData(true), 200);
            });
        } catch (ApiError $e) {
            // Comme `POST /invitations/{token}/accept` : le 401 dit à la page de se connecter, et à quelle adresse —
            // masquée (TCK-2727), la valeur de l'en-tête que `InvitationService::emailMasque()` a posé.
            if ($e->getStatusCode() === 401) {
                throw $e->with(['requires_login' => true, 'email' => InvitationService::emailMasque($invitation)]);
            }

            throw $e;
        }
    }
}
