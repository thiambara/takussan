<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * OTP lifecycle for phone verification.
 *
 * Codes are stored in the cache under a per-user key with a 5-minute TTL.
 * Resend is rate-limited to 1 / 60s via a second cache key.
 *
 * In dev / testing the OTP is logged to the `auth` channel so the ticket
 * AC can be exercised end-to-end without a real SMS provider. Production
 * should swap `sendSms()` for a Twilio / Vonage driver.
 */
class PhoneVerificationService
{
    private const CODE_TTL_SECONDS = 300;        // 5 minutes

    private const RESEND_COOLDOWN_SECONDS = 60;  // 1 / 60s

    public function __construct(private readonly CacheRepository $cache) {}

    public function canResend(User $user): bool
    {
        return ! $this->cache->has($this->cooldownKey($user));
    }

    public function resendCooldownSeconds(User $user): int
    {
        return (int) ($this->cache->get($this->cooldownKey($user).':ttl') ?? 0);
    }

    /**
     * Generate + store a fresh OTP, enforce cooldown, and dispatch SMS.
     * Returns the OTP only in non-production environments (useful for tests).
     */
    public function sendOtp(User $user): ?string
    {
        if (! $user->phone) {
            return null;
        }

        if (! $this->canResend($user)) {
            return null;
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $this->cache->put($this->otpKey($user), $code, self::CODE_TTL_SECONDS);
        $this->cache->put($this->cooldownKey($user), true, self::RESEND_COOLDOWN_SECONDS);

        $this->sendSms($user, $code);

        return app()->environment('production') ? null : $code;
    }

    public function verifyOtp(User $user, string $code): bool
    {
        $stored = $this->cache->get($this->otpKey($user));
        if (! $stored || ! hash_equals((string) $stored, trim($code))) {
            return false;
        }

        $this->cache->forget($this->otpKey($user));
        $this->cache->forget($this->cooldownKey($user));

        return true;
    }

    /**
     * Dev driver: logs the OTP to the configured channel. In prod this should
     * be swapped for a real SMS transport (Twilio, Vonage, Orange API, ...).
     */
    protected function sendSms(User $user, string $code): void
    {
        Log::channel(config('logging.default'))->info('[phone-otp] Dispatching OTP', [
            'user_id' => $user->id,
            'phone' => $user->phone,
            'code' => $code,
            'expires_in_seconds' => self::CODE_TTL_SECONDS,
            'driver' => 'log-stub',
            'correlation_id' => (string) Str::uuid(),
        ]);
    }

    private function otpKey(User $user): string
    {
        return "phone-otp:{$user->id}";
    }

    private function cooldownKey(User $user): string
    {
        return "phone-otp-cooldown:{$user->id}";
    }
}
