<?php

namespace App\Services\Auth;

use App\Models\User;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
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
 *
 * Replay protection: every successful TOTP verification records the used
 * 30-second timestamp in the cache under `totp-last:{user_id}`. Subsequent
 * verifications refuse any timestamp <= that, so a 6-digit code cannot be
 * re-used within its ±30 s validity window.
 */
class TwoFactorService
{
    /** Cache TTL long enough to cover the whole validity window (±1 step). */
    private const REPLAY_TTL_SECONDS = 120;

    public function __construct(
        private readonly Google2FA $google2fa,
        private readonly CacheRepository $cache,
    ) {}

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

    /**
     * Render the 2FA QR code as an inline SVG (text/xml). We went with the
     * local bacon/bacon-qr-code renderer as part of TCK-078: the previous
     * UI hit api.qrserver.com, which leaked the otpauth URL (including the
     * shared secret) to a third party and made 2FA enrollment dependent
     * on external availability. SVG keeps the payload small, scales
     * cleanly in the React dialog, and requires no extra PHP extensions
     * beyond what PHP 8.3 already ships.
     */
    public function qrCodeSvg(User $user, string $secret, int $size = 200): string
    {
        $renderer = new ImageRenderer(
            new RendererStyle($size),
            new SvgImageBackEnd,
        );

        return (new Writer($renderer))->writeString($this->qrCodeUrl($user, $secret));
    }

    /**
     * Validate a 6-digit TOTP code (stateless — no replay protection).
     *
     * Prefer {@see verifyCodeForUser()} whenever a User is in scope: it
     * layers single-use semantics on top of the raw TOTP check so a code
     * cannot be replayed within its ±30 s validity window.
     */
    public function verifyCode(string $secret, string $code): bool
    {
        $code = preg_replace('/\s+/', '', $code);
        if (! preg_match('/^\d{6}$/', $code)) {
            return false;
        }

        // window=1 allows ±30s clock skew — standard for TOTP
        return (bool) $this->google2fa->verifyKey($secret, $code, 1);
    }

    /**
     * Validate a 6-digit TOTP code and reject codes already consumed.
     *
     * `verifyKeyNewer` returns the 30-second timestamp used for the match
     * (or false). We persist the last accepted timestamp per user and
     * refuse any value <= that, blocking replay within the ±30 s window.
     */
    public function verifyCodeForUser(User $user, string $secret, string $code): bool
    {
        $code = preg_replace('/\s+/', '', $code);
        if (! preg_match('/^\d{6}$/', $code)) {
            return false;
        }

        $lastKey = $this->replayKey($user);
        // Always pass a non-null $oldTimestamp so verifyKeyNewer returns the
        // matched 30-second step (rather than `true`), giving us the value
        // we need to persist for replay prevention. 0 = "no previous code".
        $lastTimestamp = (int) $this->cache->get($lastKey, 0);

        $used = $this->google2fa->verifyKeyNewer($secret, $code, $lastTimestamp, 1);
        if ($used === false || $used === true) {
            return false;
        }

        $this->cache->put($lastKey, (int) $used, self::REPLAY_TTL_SECONDS);

        return true;
    }

    private function replayKey(User $user): string
    {
        return "totp-last:{$user->id}";
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
