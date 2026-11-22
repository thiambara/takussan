<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Invitation\SendInvitationCodeRequest;
use App\Http\Requests\Invitation\VerifyInvitationCodeRequest;
use App\Providers\AppServiceProvider;
use App\Services\Auth\AuthRefusal;
use App\Services\Auth\LoginLock;
use App\Services\Auth\PhoneLoginService;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Invitation\InvitationCodeAcceptance;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2610 (ADR-0094 § 5) — accepter une invitation par code SMS : le compte naît, ou s'ouvre, et l'invitation est
 * acceptée en un envoi. Public, derrière `auth.phone_login.enabled` (404 drapeau éteint, cf. les FormRequests). Le
 * contrôleur ne décide rien : {@see InvitationCodeAcceptance}.
 */
class InvitationCodeController extends Controller
{
    public function __construct(
        private readonly InvitationCodeAcceptance $acceptance,
        private readonly PhoneVerificationService $codes,
        private readonly LoginLock $lock,
    ) {}

    /** 202, et la MÊME réponse que le numéro ait un compte ou non, comme `auth/phone/request-code`. */
    public function send(SendInvitationCodeRequest $request): JsonResponse
    {
        $phone = $request->phone();
        if (! PhoneVerificationService::countryAllowed($phone)) {
            return AuthRefusal::response(422, 'phone_country_not_allowed', 'auth.phone.country_not_allowed');
        }

        return $this->json([
            'message' => __('auth.phone.code_sent'),
            'data' => $this->acceptance->sendCode($phone, app()->getLocale(), $request->channel()),
        ], 202);
    }

    public function verify(VerifyInvitationCodeRequest $request): JsonResponse
    {
        $response = $this->acceptance->verify($request->invitation(), $request->phone(), $request->validated(), $request);

        // TCK-2404 (vérification adverse I1) — les conditions présentées suivent un code juste : l'essai est rendu.
        if (PhoneLoginService::presentsTerms($response)) {
            AppServiceProvider::refundPhoneVerify($request);
        }

        return $this->withAttemptsLeft($response, $request);
    }

    /**
     * TCK-2939 (ADR-0094, amendement du 2026-11-15 § 5) — un code faux dit combien d'essais il reste : le plus petit des
     * restes des TROIS compteurs existants du numéro (le limiteur `auth-phone-verify`, les essais du code en cours, le
     * verrou `LoginLock`). Aucune seconde comptabilité, et tous trois sont par NUMÉRO : la valeur ne dit rien de
     * l'existence d'un compte. Au bout, la réponse reste celle du limiteur (429) ou du verrou (423).
     */
    private function withAttemptsLeft(JsonResponse $response, VerifyInvitationCodeRequest $request): JsonResponse
    {
        $data = $response->getData(true);
        if ($response->getStatusCode() !== 422 || ! is_array($data) || ($data['code'] ?? null) !== 'phone_code_invalid') {
            return $response;
        }

        $phone = $request->phone();
        $left = array_filter([
            AppServiceProvider::phoneVerifyAttemptsLeft($request),
            $this->codes->attemptsLeftFor(PhoneLoginService::SCOPE, $phone),
            $this->lock->numberFailuresLeft($phone),
        ], fn (?int $n): bool => $n !== null);

        return $response->setData($data + ['attempts_left' => min($left)]);
    }
}
