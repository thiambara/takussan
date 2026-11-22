<?php

namespace App\Services\Invitation;

use App\Exceptions\ApiError;
use App\Http\Resources\InvitationResource;
use App\Http\Resources\UserResource;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Auth\PhoneLoginService;
use App\Services\Auth\PhoneVerificationService;
use App\Support\CanonicalPhone;
use App\Support\Masking;
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
    /** TCK-2939 — « numéro corrigé par l'invité ». */
    public const EVENT_PHONE_CORRECTED = 'invitation_phone_corrected';

    public function __construct(
        private readonly PhoneLoginService $login,
        private readonly InvitationService $invitations,
        private readonly PhoneVerificationService $codes,
    ) {}

    /**
     * TCK-2940 (ADR-0126) — `voice` : le même code, dicté par un appel. `retry_after` est le délai de la voie demandée ;
     * `voice_available` dit à l'écran s'il peut proposer « le recevoir par appel ».
     *
     * @return array{retry_after: int, channel: string, voice_available: bool}
     */
    public function sendCode(string $phone, ?string $locale, string $channel = 'sms'): array
    {
        if ($channel === 'voice') {
            $this->login->requestVoiceCode($phone, $locale);
            $retryAfter = $this->codes->callToAvailableIn(PhoneLoginService::SCOPE, $phone) ?: PhoneVerificationService::VOICE_COOLDOWN_SECONDS;
        } else {
            $this->login->requestCode($phone, $locale);
            $retryAfter = $this->codes->sendToAvailableIn(PhoneLoginService::SCOPE, $phone) ?: $this->codes->retryAfter();
        }

        return ['retry_after' => $retryAfter, 'channel' => $channel, 'voice_available' => PhoneVerificationService::voiceAvailable()];
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

                // TCK-2939 (ADR-0094, amendement du 2026-11-15 § 4) — le numéro corrigé par l'invité devient celui de
                // l'invitation, dans cette transaction : un refus de l'acceptation le défait avec le reste.
                $this->correctNumber($invitation, $outcome['user'], $phone);

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

    /**
     * TCK-2939 (ADR-0094, amendement du 2026-11-15 § 4) — une invitation par SMS dont l'invité a corrigé le numéro :
     * le code vient de prouver ce numéro, l'invitation lui est réadressée (le numéro VÉRIFIÉ du compte, forme du compte),
     * et le journal le dit, numéros masqués. Une invitation partagée (ADR-0123 § 4) ne se réadresse jamais — la
     * requête le refuse déjà en 422, cette garde ne s'en remet pas à elle.
     */
    private function correctNumber(Invitation $invitation, User $user, string $phone): void
    {
        if ($invitation->email !== null || CanonicalPhone::fold($phone) === CanonicalPhone::fold((string) $invitation->phone)) {
            return;
        }
        if ($invitation->estPartagee()) {
            abort_code(403, 'invitation.phone_mismatch');
        }

        $previous = (string) $invitation->phone;
        $invitation->forceFill(['phone' => (string) $user->phone])->save();

        activity('Invitation')
            ->performedOn($invitation)
            ->causedBy($user)
            ->withProperties([
                'from' => $previous === '' ? null : Masking::phone($previous),
                'to' => Masking::phone((string) $user->phone),
            ])
            ->event(self::EVENT_PHONE_CORRECTED)
            ->log(self::EVENT_PHONE_CORRECTED);
    }
}
