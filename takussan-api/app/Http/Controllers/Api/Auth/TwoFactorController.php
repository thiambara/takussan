<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\ConfirmTwoFactorRequest;
use App\Http\Requests\Auth\DisableTwoFactorRequest;
use App\Http\Requests\Auth\StepUpTwoFactorRequest;
use App\Models\User;
use App\Services\Auth\AuthRefusal;
use App\Services\Auth\SessionTokenIssuer;
use App\Services\Auth\TwoFactorService;
use App\Support\Security\TwoFactorRequirement;
use App\Support\Security\TwoFactorSession;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class TwoFactorController extends Controller
{
    /** TCK-589 — durée de vie du secret en attente d'un renouvellement d'appareil. */
    private const RENEWAL_TTL_SECONDS = 600;

    public function __construct(
        private readonly TwoFactorService $service,
        private readonly CacheRepository $cache,
    ) {}

    public function enable(Request $request): JsonResponse
    {
        $user = $request->user();

        // TCK-589 — renouvellement de l'appareil (contrainte 10) : la 2FA exigée ne
        // se désactive plus, elle se REMPLACE. Le nouveau secret attend en cache,
        // chiffré, que `confirm` le prouve ; l'ancien reste valide jusque-là. Le
        // geste exige un step-up : une session volée ne réenrôle pas un appareil.
        if ($user->two_factor_enabled) {
            if (SessionTokenIssuer::stepUpValidUntil($user->currentAccessToken()) === null) {
                return AuthRefusal::response(403, 'two_factor_step_up_required', 'auth.two_factor.step_up_required');
            }

            $secret = $this->service->generateSecret();
            $this->cache->put($this->renewalKey($user), Crypt::encryptString($secret), self::RENEWAL_TTL_SECONDS);

            return $this->json(['data' => $this->enrollmentPayload($user, $secret)]);
        }

        $secret = $this->service->generateSecret();

        $user->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => null,
            'two_factor_enabled' => false,
        ])->save();

        return $this->json(['data' => $this->enrollmentPayload($user, $secret)]);
    }

    /**
     * TCK-078 — standalone QR endpoint: returns the scanner image as an
     * inline SVG so the dialog can reload it without hitting an external
     * service. Only callable while the user is mid-enrollment (pending
     * confirm()), which mirrors the previous `qr_url` contract.
     */
    public function qr(Request $request): Response
    {
        $user = $request->user();
        $pending = $user->two_factor_enabled ? $this->pendingRenewal($user) : null;
        abort_code_unless(
            $pending !== null || ($user->two_factor_secret !== null && ! $user->two_factor_enabled),
            422,
            'two_factor.not_in_setup',
        );

        $svg = $this->service->qrCodeSvg($user, $pending ?? $user->two_factor_secret);

        return response($svg, 200, [
            'Content-Type' => 'image/svg+xml',
            'Cache-Control' => 'no-store, max-age=0',
        ]);
    }

    public function confirm(ConfirmTwoFactorRequest $request): JsonResponse
    {
        $user = $request->user();
        if ($user->two_factor_enabled) {
            return $this->confirmRenewal($user, (string) $request->input('code'));
        }
        abort_code_unless($user->two_factor_secret !== null, 422, 'two_factor.enable_first');

        abort_code_unless(
            $this->service->verifyCodeForUser($user, $user->two_factor_secret, $request->input('code')),
            422,
            'two_factor.code_invalid',
        );

        $recoveryCodes = $this->service->generateRecoveryCodes();

        // TCK-589 — l'enrôlement solde une réinitialisation par le support :
        // `force_2fa_reconfigure` cesse de fermer les routes hors `auth/*`.
        $metadata = $user->metadata ?? [];
        unset($metadata['force_2fa_reconfigure']);

        $user->forceFill([
            'two_factor_enabled' => true,
            'two_factor_recovery_codes' => json_encode($recoveryCodes),
            'metadata' => $metadata,
        ])->save();
        $this->markSessionVerified($user);

        return $this->json([
            'data' => [
                'enabled' => true,
                'recovery_codes' => $recoveryCodes,
            ],
        ]);
    }

    public function disable(DisableTwoFactorRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_code_unless($user->two_factor_enabled, 422, 'two_factor.not_enabled');

        // TCK-589 — contrainte 10 : la 2FA exigée ne se désactive pas, ni par le mot
        // de passe ni par un code. Elle se renouvelle (`enable` sous step-up).
        if (TwoFactorRequirement::isMandatory($user)) {
            return AuthRefusal::response(422, 'two_factor_mandatory', 'auth.two_factor.mandatory');
        }

        $authorized = false;
        if ($request->filled('password')) {
            $authorized = \Hash::check($request->input('password'), $user->password);
        }
        if (! $authorized && $request->filled('code')) {
            $authorized = $this->service->verifyCodeForUser(
                $user,
                $user->two_factor_secret,
                $request->input('code'),
            );
        }
        abort_code_unless($authorized, 422, 'two_factor.password_or_code_invalid');

        $user->forceFill([
            'two_factor_enabled' => false,
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
        ])->save();

        // Un événement NOMMÉ, que `AlertableEvents` sait router vers les super-admins
        // — l'entrée `updated` générique de `LogsActivity` ne disait pas quoi.
        activity('Security')
            ->performedOn($user)
            ->causedBy($user)
            ->withProperties(['user_id' => $user->id])
            ->event('two_factor_disabled')
            ->log('two_factor_disabled');

        return $this->json(['data' => ['disabled' => true]]);
    }

    /**
     * TCK-589 — `POST /auth/two-factor/step-up` : un TOTP frais, porté par LE jeton
     * de la requête pour 10 minutes (contrainte 9). Une autre session du même
     * compte ne l'hérite pas.
     */
    public function stepUp(StepUpTwoFactorRequest $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->two_factor_enabled) {
            return AuthRefusal::response(422, 'two_factor_not_enabled', 'auth.two_factor.not_enabled');
        }

        $token = $user->currentAccessToken();
        if (! $token instanceof PersonalAccessToken
            || ! $this->service->verifyCodeForUser($user, (string) $user->two_factor_secret, (string) $request->input('code'))) {
            return AuthRefusal::response(422, 'two_factor_step_up_invalid', 'auth.two_factor.step_up_invalid');
        }

        $validUntil = SessionTokenIssuer::markStepUp($token);

        return $this->json(['data' => ['valid_until' => $validUntil->toIso8601String()]]);
    }

    public function recoveryCodes(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_code_unless($user->two_factor_enabled, 422, 'two_factor.not_enabled');

        return $this->json(['data' => ['recovery_codes' => $this->service->recoveryCodes($user)]]);
    }

    public function regenerateRecoveryCodes(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_code_unless($user->two_factor_enabled, 422, 'two_factor.not_enabled');

        $codes = $this->service->generateRecoveryCodes();
        $user->forceFill(['two_factor_recovery_codes' => json_encode($codes)])->save();

        return $this->json(['data' => ['recovery_codes' => $codes]]);
    }

    // -----------------------------------------------------------------
    // TCK-589 — renouvellement de l'appareil
    // -----------------------------------------------------------------

    private function confirmRenewal(User $user, string $code): JsonResponse
    {
        $pending = $this->pendingRenewal($user);
        if ($pending === null) {
            return AuthRefusal::response(422, 'two_factor_renewal_missing', 'auth.two_factor.renewal_missing');
        }

        abort_code_unless($this->service->verifyCodeForUser($user, $pending, $code), 422, 'two_factor.code_invalid');

        $recoveryCodes = $this->service->generateRecoveryCodes();
        $user->forceFill([
            'two_factor_secret' => $pending,
            'two_factor_recovery_codes' => json_encode($recoveryCodes),
        ])->save();
        $this->cache->forget($this->renewalKey($user));
        $this->markSessionVerified($user);

        return $this->json(['data' => ['enabled' => true, 'renewed' => true, 'recovery_codes' => $recoveryCodes]]);
    }

    /**
     * Vérification adverse B2 — un TOTP vient d'être saisi sur CE jeton : la session est à
     * deux facteurs ({@see TwoFactorSession}), sans second code.
     */
    private function markSessionVerified(User $user): void
    {
        $token = $user->currentAccessToken();
        if ($token instanceof PersonalAccessToken && $token->exists) {
            SessionTokenIssuer::markStepUp($token);
        }
    }

    private function pendingRenewal(User $user): ?string
    {
        $encrypted = $this->cache->get($this->renewalKey($user));

        return is_string($encrypted) ? Crypt::decryptString($encrypted) : null;
    }

    private function renewalKey(User $user): string
    {
        return "two-factor-renewal:{$user->id}";
    }

    /** @return array{secret: string, qr_url: string, qr_svg: string} */
    private function enrollmentPayload(User $user, string $secret): array
    {
        return [
            'secret' => $secret,
            'qr_url' => $this->service->qrCodeUrl($user, $secret),
            // TCK-078 — embed the QR as data URI so the SPA does not
            // have to hit the external api.qrserver.com proxy. Keep
            // `qr_url` for copy/paste fallback.
            'qr_svg' => 'data:image/svg+xml;base64,'.base64_encode(
                $this->service->qrCodeSvg($user, $secret),
            ),
        ];
    }
}
