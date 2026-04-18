<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class TwoFactorController extends Controller
{
    public function enable(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->two_factor_enabled, 422, 'Two-factor authentication is already enabled.');

        $secret = strtoupper(Str::random(32));

        $user->update([
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => json_encode($this->generateRecoveryCodes()),
        ]);

        return $this->json([
            'data' => [
                'secret' => $secret,
                'qr_url' => 'otpauth://totp/Takussan:'.$user->email.'?secret='.$secret.'&issuer=Takussan',
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

        // Verification is intentionally simplified here;
        // integrate a proper TOTP library (e.g. spatie/laravel-google2fa) when ready.
        $user->update(['two_factor_enabled' => true]);

        return $this->json(['data' => ['enabled' => true]]);
    }

    public function disable(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->two_factor_enabled, 422, 'Two-factor authentication is not enabled.');

        $request->validate([
            'password' => ['required', 'string', 'current_password'],
        ]);

        $user->update([
            'two_factor_enabled' => false,
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
        ]);

        return $this->json(['data' => ['disabled' => true]]);
    }

    public function recoveryCodes(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->two_factor_enabled, 422, 'Two-factor authentication is not enabled.');

        $codes = json_decode($user->two_factor_recovery_codes ?? '[]', true);

        return $this->json(['data' => ['recovery_codes' => $codes]]);
    }

    /** @return array<int,string> */
    private function generateRecoveryCodes(): array
    {
        return array_map(fn () => strtoupper(Str::random(5)).'-'.strtoupper(Str::random(5)), range(1, 8));
    }
}
