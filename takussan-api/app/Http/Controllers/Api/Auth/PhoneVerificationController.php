<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\ResendPhoneVerificationRequest;
use App\Http\Requests\Auth\VerifyPhoneVerificationRequest;
use App\Services\Auth\AuthRefusal;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Http\JsonResponse;

class PhoneVerificationController extends Controller
{
    public function __construct(private readonly PhoneVerificationService $service) {}

    public function verify(VerifyPhoneVerificationRequest $request): JsonResponse
    {

        $user = $request->user();
        abort_if($user->phone_verified_at !== null, 422, __('auth.phone.already_verified'));
        abort_unless($user->phone !== null, 422, __('auth.phone.missing'));

        abort_unless(
            $this->service->verifyOtp($user, $request->input('code')),
            422,
            __('auth.phone.code_invalid'),
        );

        // TCK-589 — le seul écrivain de `phone_verified_at` : 409 `phone_taken`
        // si un autre compte a déjà vérifié ce numéro.
        $this->service->markVerified($user, (string) $user->phone);

        return $this->json(['data' => ['verified' => true]]);
    }

    public function resend(ResendPhoneVerificationRequest $request): JsonResponse
    {

        $user = $request->user();

        // Onboarding wizards collect the phone in the same step as the OTP
        // send — persist it here (mirroring `MeController::update` semantics)
        // so the user record has the value before we hit the SMS gateway.
        // Changing the phone resets `phone_verified_at`, matching the
        // contract of every other update path.
        if ($request->has('phone')) {
            $incoming = $request->input('phone');
            $incoming = is_string($incoming) ? trim($incoming) : null;
            $incoming = $incoming === '' ? null : $incoming;
            if ($incoming !== null && $incoming !== $user->phone) {
                $user->forceFill([
                    'phone' => $incoming,
                    'phone_verified_at' => null,
                ])->save();
            }
        }

        abort_if($user->phone_verified_at !== null, 422, __('auth.phone.already_verified'));
        abort_unless($user->phone !== null, 422, __('auth.phone.missing'));

        // TCK-589 — refuser AVANT de dépenser un SMS un numéro qu'un autre
        // compte a déjà vérifié : le code reçu ne pourrait rien vérifier.
        if ($this->service->isVerifiedElsewhere((string) $user->phone, $user)) {
            return AuthRefusal::response(409, 'phone_taken', 'auth.phone.taken');
        }

        abort_unless(
            $this->service->canResend($user),
            429,
            __('auth.phone.resend_wait'),
        );

        // TCK-589 — le code n'est rendu dans AUCUN environnement (`debug_code`
        // retiré) : il part par SMS, et les tests le lisent par le faux routeur.
        $this->service->sendOtp($user);

        return $this->json(['data' => ['sent' => true]]);
    }
}
