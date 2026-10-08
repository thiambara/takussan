<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\RequestPhoneLoginCodeRequest;
use App\Http\Requests\Auth\VerifyPhoneLoginCodeRequest;
use App\Services\Auth\AuthRefusal;
use App\Services\Auth\PhoneLoginService;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Http\JsonResponse;

/**
 * TCK-589 (ADR-0033) — connexion et inscription par téléphone, derrière
 * `auth.phone_login.enabled` (404 drapeau éteint, cf. les FormRequests).
 */
class PhoneLoginController extends Controller
{
    public function __construct(private readonly PhoneLoginService $login) {}

    /**
     * 202, et la MÊME réponse que le numéro ait un compte ou non, qu'il soit
     * verrouillé ou dans son délai de renvoi : rien ne s'énumère par ici.
     */
    public function requestCode(RequestPhoneLoginCodeRequest $request): JsonResponse
    {
        $phone = (string) $request->validated('phone');
        // Vérification adverse M3 — l'indicatif ne dit rien d'un compte : le refuser
        // ouvertement n'énumère rien, et rien ne part.
        if (! PhoneVerificationService::countryAllowed($phone)) {
            return AuthRefusal::response(422, 'phone_country_not_allowed', 'auth.phone.country_not_allowed');
        }

        $this->login->requestCode($phone, app()->getLocale());

        return $this->json([
            'message' => __('auth.phone.code_sent'),
            'data' => ['retry_after' => app(PhoneVerificationService::class)->retryAfter()],
        ], 202);
    }

    public function verifyCode(VerifyPhoneLoginCodeRequest $request): JsonResponse
    {
        return $this->login->verify(
            (string) $request->validated('phone'),
            (string) $request->validated('code'),
            $request->only(['two_factor_code', 'recovery_code', 'device_name']),
            app()->getLocale(),
        );
    }
}
