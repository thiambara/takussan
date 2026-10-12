<?php

namespace App\Services\Auth;

use App\Exceptions\ApiError;
use App\Services\Notifications\Sms\PhoneNumber;
use Illuminate\Cache\RateLimiter;
use InvalidArgumentException;

/**
 * TCK-622 — la borne PAR NUMÉRO des codes SMS (ADR-0033 §6) : 3 par quart d'heure, 5 par 24 h.
 *
 * ⚠ **Elle compte les codes ENVOYÉS, pas les requêtes.** Elle était un limiteur de route
 * (`throttle:auth-phone-send`), donc jugée AVANT le contrôleur : un clic refusé par le délai de
 * renvoi, une saisie invalide ou une réponse neutre coûtaient une place, et deux envois réels plus
 * un clic de trop suffisaient à fermer le numéro pour quinze minutes — sur un parcours ordinaire
 * (connexion, puis onboarding), mesuré en préproduction le 2026-10-10.
 *
 * Le contrôleur demande donc {@see ensureAvailable()} avant l'envoi (429 `phone.send_limit`, avec
 * le délai) et {@see hit()} après un envoi réel — ou après une réponse neutre qui doit s'en
 * comporter comme un (vérification adverse m4) : la borne ne doit rien dire de plus que l'envoi.
 *
 * Hors production, là où le code s'affiche à l'écran (ADR-0060), la borne s'élargit : un testeur
 * ne paie aucun SMS qu'il ne lise déjà, et il refait le même parcours dix fois.
 *
 * La borne PAR IP (20/h) reste un limiteur de route, sur toutes les requêtes : elle borne la
 * pulvérisation de numéros, pas le parcours d'un utilisateur.
 */
class PhoneSendQuota
{
    public const PER_WINDOW = 3;

    public const WINDOW_SECONDS = 900;

    public const PER_DAY = 5;

    /** Hors production, code affiché (ADR-0060). */
    public const PREVIEW_PER_WINDOW = 20;

    public const PREVIEW_PER_DAY = 60;

    private const DAY_SECONDS = 86400;

    public function __construct(private readonly RateLimiter $limiter) {}

    /** Lève 429 si le numéro a épuisé l'une de ses deux bornes ; ne compte rien. */
    public function ensureAvailable(string $phone): void
    {
        [$window, $day] = $this->keys($phone);

        if ($this->limiter->tooManyAttempts($day, $this->perDay())) {
            $this->refuse('phone.send_limit_day', $this->limiter->availableIn($day), 'hours', 3600);
        }
        if ($this->limiter->tooManyAttempts($window, $this->perWindow())) {
            $this->refuse('phone.send_limit', $this->limiter->availableIn($window), 'minutes', 60);
        }
    }

    /** Un code est parti vers ce numéro (ou une réponse neutre en tient lieu). */
    public function hit(string $phone): void
    {
        [$window, $day] = $this->keys($phone);

        $this->limiter->hit($window, self::WINDOW_SECONDS);
        $this->limiter->hit($day, self::DAY_SECONDS);
    }

    private function perWindow(): int
    {
        return OtpPreview::enabled() ? self::PREVIEW_PER_WINDOW : self::PER_WINDOW;
    }

    private function perDay(): int
    {
        return OtpPreview::enabled() ? self::PREVIEW_PER_DAY : self::PER_DAY;
    }

    private function refuse(string $code, int $seconds, string $unit, int $unitSeconds): never
    {
        $seconds = max(1, $seconds);

        throw (new ApiError(429, $code, [$unit => (int) ceil($seconds / $unitSeconds)], [
            'Retry-After' => (string) $seconds,
        ]))->with(['retry_after' => $seconds]);
    }

    /** @return array{0: string, 1: string} */
    private function keys(string $phone): array
    {
        $normalized = $this->normalize($phone);

        return ['phone-send:'.$normalized, 'phone-send-day:'.$normalized];
    }

    private function normalize(string $phone): string
    {
        try {
            return PhoneNumber::normalize($phone);
        } catch (InvalidArgumentException) {
            return preg_replace('/\s+/', '', $phone) ?? $phone;
        }
    }
}
