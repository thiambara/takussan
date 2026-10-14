<?php

namespace App\Http\Controllers\Api\Auth;

use App\Exceptions\ApiError;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\SecondaryPhoneRequest;
use App\Http\Requests\Auth\VerifySecondaryPhoneRequest;
use App\Http\Resources\UserResource;
use App\Services\Auth\PhoneSendQuota;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-633 (lot C) — le second numéro d'un compte : envoi du code, vérification, retrait.
 *
 * Mêmes portes que tout code (`PhoneVerificationController::resend`) : indicatif servi, délai
 * de renvoi, borne par numéro (`PhoneSendQuota`), plafond journalier global. Un numéro déjà
 * vérifié AILLEURS reçoit la réponse d'un envoi réel sans SMS (vérification adverse m4) ; le refus
 * ferme est à la vérification (`markSecondaryVerified`, 409). Le numéro n'est jamais journalisé.
 */
class SecondaryPhoneController extends Controller
{
    public function __construct(
        private readonly PhoneVerificationService $service,
        private readonly PhoneSendQuota $quota,
    ) {}

    public function sendOtp(SecondaryPhoneRequest $request): JsonResponse
    {
        $user = $request->user();
        $phone = (string) $request->validated('phone');

        abort_code_if($this->service->isPrimaryOf($user, $phone), 422, 'secondary_phone.same_as_primary');
        abort_code_unless(PhoneVerificationService::countryAllowed($phone), 422, 'secondary_phone.country_not_allowed');

        $scope = $this->service->secondaryScope($user);
        $this->refuseWhileCoolingDown($this->service->sendToAvailableIn($scope, $phone));
        $this->quota->ensureAvailable($phone);

        if ($this->service->isVerifiedElsewhere($phone, $user)) {
            $this->quota->hit($phone);
            $this->service->holdCooldownFor($scope, $phone);

            return $this->sent();
        }

        abort_code_unless($this->service->sendCodeTo($scope, $phone, $user->preferred_language), 503, 'secondary_phone.capacity_reached');
        $this->quota->hit($phone);

        return $this->sent();
    }

    public function verify(VerifySecondaryPhoneRequest $request): JsonResponse
    {
        $user = $request->user();
        $phone = (string) $request->validated('phone');

        abort_code_unless(
            $this->service->verifyCodeFor($this->service->secondaryScope($user), $phone, (string) $request->validated('code')),
            422,
            'secondary_phone.code_invalid',
        );
        $this->service->markSecondaryVerified($user, $phone, $request->boolean('whatsapp'));

        return $this->json(new UserResource($user->fresh()));
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->service->clearSecondary($user);

        return $this->json(new UserResource($user->fresh()));
    }

    private function sent(): JsonResponse
    {
        return $this->json(['data' => ['sent' => true, 'retry_after' => $this->service->retryAfter()]]);
    }

    /** Même refus que le numéro principal (TCK-622) : 429 `phone.resend_too_soon` et les secondes restantes. */
    private function refuseWhileCoolingDown(int $seconds): void
    {
        if ($seconds > 0) {
            throw (new ApiError(429, 'phone.resend_too_soon', ['seconds' => $seconds], ['Retry-After' => (string) $seconds]))
                ->with(['retry_after' => $seconds]);
        }
    }
}
