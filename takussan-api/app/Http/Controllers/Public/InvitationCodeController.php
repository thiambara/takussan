<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Invitation\SendInvitationCodeRequest;
use App\Http\Requests\Invitation\VerifyInvitationCodeRequest;
use App\Providers\AppServiceProvider;
use App\Services\Auth\AuthRefusal;
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
    public function __construct(private readonly InvitationCodeAcceptance $acceptance) {}

    /** 202, et la MÊME réponse que le numéro ait un compte ou non, comme `auth/phone/request-code`. */
    public function send(SendInvitationCodeRequest $request): JsonResponse
    {
        $phone = $request->phone();
        if (! PhoneVerificationService::countryAllowed($phone)) {
            return AuthRefusal::response(422, 'phone_country_not_allowed', 'auth.phone.country_not_allowed');
        }

        return $this->json([
            'message' => __('auth.phone.code_sent'),
            'data' => $this->acceptance->sendCode($phone, app()->getLocale()),
        ], 202);
    }

    public function verify(VerifyInvitationCodeRequest $request): JsonResponse
    {
        $response = $this->acceptance->verify($request->invitation(), $request->phone(), $request->validated(), $request);

        // TCK-2404 (vérification adverse I1) — les conditions présentées suivent un code juste : l'essai est rendu.
        if (PhoneLoginService::presentsTerms($response)) {
            AppServiceProvider::refundPhoneVerify($request);
        }

        return $response;
    }
}
