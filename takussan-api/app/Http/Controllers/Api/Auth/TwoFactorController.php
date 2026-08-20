<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\ConfirmTwoFactorRequest;
use App\Http\Requests\Auth\DisableTwoFactorRequest;
use App\Services\Auth\TwoFactorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TwoFactorController extends Controller
{
    public function __construct(private readonly TwoFactorService $service) {}

    public function enable(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->two_factor_enabled, 422, 'Two-factor authentication is already enabled.');

        $secret = $this->service->generateSecret();

        $user->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => null,
            'two_factor_enabled' => false,
        ])->save();

        return $this->json([
            'data' => [
                'secret' => $secret,
                'qr_url' => $this->service->qrCodeUrl($user, $secret),
                // TCK-078 — embed the QR as data URI so the SPA does not
                // have to hit the external api.qrserver.com proxy. Keep
                // `qr_url` for copy/paste fallback.
                'qr_svg' => 'data:image/svg+xml;base64,'.base64_encode(
                    $this->service->qrCodeSvg($user, $secret),
                ),
            ],
        ]);
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
        abort_unless(
            $user->two_factor_secret !== null && ! $user->two_factor_enabled,
            422,
            'Two-factor authentication is not in a setup state.',
        );

        $svg = $this->service->qrCodeSvg($user, $user->two_factor_secret);

        return response($svg, 200, [
            'Content-Type' => 'image/svg+xml',
            'Cache-Control' => 'no-store, max-age=0',
        ]);
    }

    public function confirm(ConfirmTwoFactorRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->two_factor_enabled, 422, 'Two-factor authentication is already enabled.');
        abort_unless($user->two_factor_secret !== null, 422, 'Please call /two-factor/enable first.');

        abort_unless(
            $this->service->verifyCodeForUser($user, $user->two_factor_secret, $request->input('code')),
            422,
            'Invalid TOTP code.',
        );

        $recoveryCodes = $this->service->generateRecoveryCodes();

        $user->forceFill([
            'two_factor_enabled' => true,
            'two_factor_recovery_codes' => json_encode($recoveryCodes),
        ])->save();

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
        abort_unless($user->two_factor_enabled, 422, 'Two-factor authentication is not enabled.');

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
        abort_unless($authorized, 422, 'Invalid password or code.');

        $user->forceFill([
            'two_factor_enabled' => false,
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
        ])->save();

        return $this->json(['data' => ['disabled' => true]]);
    }

    public function recoveryCodes(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->two_factor_enabled, 422, 'Two-factor authentication is not enabled.');

        return $this->json(['data' => ['recovery_codes' => $this->service->recoveryCodes($user)]]);
    }

    public function regenerateRecoveryCodes(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->two_factor_enabled, 422, 'Two-factor authentication is not enabled.');

        $codes = $this->service->generateRecoveryCodes();
        $user->forceFill(['two_factor_recovery_codes' => json_encode($codes)])->save();

        return $this->json(['data' => ['recovery_codes' => $codes]]);
    }
}
