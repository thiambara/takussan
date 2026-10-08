<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\ResendPhoneVerificationRequest;
use App\Http\Requests\Auth\VerifyPhoneVerificationRequest;
use App\Models\User;
use App\Services\Auth\AuthRefusal;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Http\JsonResponse;

class PhoneVerificationController extends Controller
{
    public function __construct(private readonly PhoneVerificationService $service) {}

    public function verify(VerifyPhoneVerificationRequest $request): JsonResponse
    {

        $user = $request->user();
        abort_code_if($user->phone_verified_at !== null, 422, 'phone.already_verified');
        abort_code_unless($user->phone !== null, 422, 'phone.missing');

        abort_code_unless(
            $this->service->verifyOtp($user, $request->input('code')),
            422,
            'phone.code_invalid',
        );

        // TCK-589 — le seul écrivain de `phone_verified_at` : 409 `phone.taken`
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
            // Vérification adverse M3 — hors des indicatifs servis, rien n'est écrit ni envoyé.
            if ($incoming !== null && ! PhoneVerificationService::countryAllowed($incoming)) {
                return AuthRefusal::response(422, 'phone_country_not_allowed', 'auth.phone.country_not_allowed');
            }
            // Passe 2 (p2-1) — un numéro vérifié AILLEURS s'écrit aussi, non vérifié, comme par le
            // chemin réel : sinon `GET /auth/me` relisait `phone: null` et trahissait le numéro
            // pris. La branche neutre est jugée plus bas, sur le numéro porté.
            if ($incoming !== null && $incoming !== $user->phone) {
                $user->forceFill([
                    'phone' => $incoming,
                    'phone_verified_at' => null,
                ])->save();
            }
        }

        abort_code_if($user->phone_verified_at !== null, 422, 'phone.already_verified');
        abort_code_unless($user->phone !== null, 422, 'phone.missing');

        // TCK-589 — ne pas dépenser de SMS pour un numéro qu'un autre compte a déjà
        // vérifié : le code reçu ne pourrait rien vérifier.
        if ($this->service->isVerifiedElsewhere((string) $user->phone, $user)) {
            return $this->neutralSend($user);
        }

        abort_code_unless(
            $this->service->canResend($user),
            429,
            'phone.resend_too_soon',
        );

        if (! PhoneVerificationService::countryAllowed((string) $user->phone)) {
            return AuthRefusal::response(422, 'phone_country_not_allowed', 'auth.phone.country_not_allowed');
        }

        // TCK-589 — le code n'est rendu dans AUCUN environnement (`debug_code`
        // retiré) : il part par SMS, et les tests le lisent par le faux routeur.
        // Le délai de renvoi est jugé plus haut : un `false` ici, c'est le plafond
        // journalier global (M3).
        if (! $this->service->sendOtp($user)) {
            return AuthRefusal::response(503, 'sms_capacity_reached', 'auth.phone.capacity_reached');
        }

        return $this->json(['data' => ['sent' => true]]);
    }

    /**
     * Vérification adverse m4 (décision du porteur) — un numéro vérifié par un AUTRE compte
     * reçoit la réponse d'un envoi réel, délai de renvoi compris, sans envoi : `409 phone_taken`
     * disait à tout compte, trois fois par minute, si un numéro est inscrit. Le numéro, lui, est
     * ÉCRIT non vérifié par l'appelant, comme par un envoi réel (passe 2, p2-1) : le profil relu
     * ne distingue pas les deux cas. Le refus ferme reste à la vérification (`markVerified`,
     * 409 `phone.taken`).
     */
    private function neutralSend(User $user): JsonResponse
    {
        abort_code_unless($this->service->canResend($user), 429, 'phone.resend_too_soon');
        $this->service->holdResendCooldown($user);

        return $this->json(['data' => ['sent' => true]]);
    }
}
