<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use App\Services\Auth\TwoFactorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
            ],
        ]);
    }

    public function confirm(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->two_factor_enabled, 422, 'Two-factor authentication is already enabled.');
        abort_unless($user->two_factor_secret !== null, 422, 'Please call /two-factor/enable first.');

        $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

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

    public function disable(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->two_factor_enabled, 422, 'Two-factor authentication is not enabled.');

        $request->validate([
            'password' => ['sometimes', 'required_without:code', 'string'],
            'code' => ['sometimes', 'required_without:password', 'string', 'size:6'],
        ]);

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
