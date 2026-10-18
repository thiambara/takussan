<?php

namespace App\Services\Notifications\Sms;

use Illuminate\Support\Carbon;

/**
 * TCK-842 (P27.04) — le budget de temps d'UNE traversée de la chaîne de repli.
 *
 * Chaque appel HTTP d'un pilote avait son propre `timeout(10)`, sans borne d'ensemble : sur un
 * numéro Orange, jeton, envoi en 401, nouveau jeton, renvoi, puis LAfricaMobile et Mtarget
 * pouvaient durer 60 s et plus, au-delà du délai du worker, qui tuait le job et le rejouait
 * depuis Orange. Le routeur pose une échéance dans le contexte ({@see self::start()}) ; chaque
 * pilote borne ses appels au temps qui reste ({@see self::httpTimeout()}) et n'en lance plus
 * quand il n'en reste pas ({@see self::exhausted()}).
 *
 * Les jobs qui envoient un SMS déclarent un `$timeout` au-dessus de ce budget
 * (`SmsChainTimeBudgetTest` le garde). Le délai du worker lui-même est une affaire de
 * déploiement.
 */
final class SmsTimeBudget
{
    /** Durée totale d'une traversée de la chaîne, en secondes. */
    public const CHAIN_SECONDS = 30;

    /** Délai maximal d'un appel HTTP d'un pilote, en secondes. */
    public const CALL_SECONDS = 10;

    /** En deçà, il ne reste pas de quoi faire un appel utile. */
    private const MIN_CALL_SECONDS = 1.0;

    private const CONTEXT_KEY = 'sms_deadline';

    /**
     * @param  array<string,mixed>  $context
     * @return array<string,mixed>
     */
    public static function start(array $context): array
    {
        $context[self::CONTEXT_KEY] = self::now() + self::CHAIN_SECONDS;

        return $context;
    }

    /** @param  array<string,mixed>  $context */
    public static function remaining(array $context): float
    {
        $deadline = $context[self::CONTEXT_KEY] ?? null;
        if (! is_float($deadline) && ! is_int($deadline)) {
            return (float) self::CHAIN_SECONDS;
        }

        return max(0.0, (float) $deadline - self::now());
    }

    /** @param  array<string,mixed>  $context */
    public static function exhausted(array $context): bool
    {
        return self::remaining($context) < self::MIN_CALL_SECONDS;
    }

    /**
     * Le délai à donner à un appel : le plus petit de son plafond et du temps qui reste.
     *
     * @param  array<string,mixed>  $context
     */
    public static function httpTimeout(array $context, float $max = self::CALL_SECONDS): float
    {
        return floor(min($max, self::remaining($context)) * 1000) / 1000;
    }

    private static function now(): float
    {
        return Carbon::now()->getPreciseTimestamp(3) / 1000;
    }
}
