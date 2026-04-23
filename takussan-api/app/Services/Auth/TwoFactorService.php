<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Str;
use PragmaRX\Google2FA\Google2FA;

/**
 * Wraps google2fa TOTP primitives + recovery-code lifecycle.
 *
 * A user goes through:
 *   enable()  -> generates a fresh secret (stored encrypted) but leaves
 *                two_factor_enabled=false until the user confirms possession.
 *   confirm() -> verifies a 6-digit TOTP code, flips two_factor_enabled=true,
 *                generates & returns 8 recovery codes (stored encrypted-hashed).
 *   disable() -> requires password OR a valid TOTP code, wipes state.
 *
 * Recovery codes are single-use: verifyRecoveryCode() pops the matching
 * code from the list and persists.
 */
class TwoFactorService
{
    public function __construct(private readonly Google2FA $google2fa) {}

    public function generateSecret(): string
    {
        return $this->google2fa->generateSecretKey(32);
    }

    public function qrCodeUrl(User $user, string $secret): string
    {
        $issuer = rawurlencode(config('app.name', 'Takussan'));
        $label = rawurlencode($user->email);

        return sprintf(
            'otpauth://totp/%s:%s?secret=%s&issuer=%s',
            $issuer,
            $label,
            $secret,
            $issuer,
        );
    }

    public function verifyCode(string $secret, string $code): bool
    {
        $code = preg_replace('/\s+/', '', $code);
        if (! preg_match('/^\d{6}$/', $code)) {
            return false;
        }

        // window=1 allows ±30s clock skew — standard for TOTP
        return (bool) $this->google2fa->verifyKey($secret, $code, 1);
    }

    /** @return array<int,string> */
    public function generateRecoveryCodes(int $count = 8): array
    {
        return array_map(
            fn () => strtoupper(Str::random(5)).'-'.strtoupper(Str::random(5)),
            range(1, $count),
        );
    }

    public function verifyRecoveryCode(User $user, string $code): bool
    {
        $codes = $this->recoveryCodes($user);
        $code = strtoupper(trim($code));

        $index = array_search($code, $codes, true);
        if ($index === false) {
            return false;
        }

        unset($codes[$index]);
        $user->forceFill([
            'two_factor_recovery_codes' => json_encode(array_values($codes)),
        ])->save();

        return true;
    }

    /** @return array<int,string> */
    public function recoveryCodes(User $user): array
    {
        if (! $user->two_factor_recovery_codes) {
            return [];
        }

        $decoded = json_decode($user->two_factor_recovery_codes, true);

        return is_array($decoded) ? array_values(array_map('strval', $decoded)) : [];
    }
}
