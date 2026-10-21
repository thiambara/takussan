<?php

namespace App\Services\Notifications\Sms;

use Illuminate\Support\Facades\Cache;

/**
 * P72.03 (TCK-1093) — la mémoire courte des codes à usage unique (`is_otp`) dont l'accusé revient
 * `failed` : par numéro et pendant 15 minutes, le fournisseur qui a accepté le code puis échoué est
 * sauté au renvoi ({@see SmsRouterDriver}). Avant, la chaîne se relisait telle quelle à chaque envoi,
 * et le renvoi repartait par le fournisseur qui venait d'échouer.
 *
 * Aucune colonne : la tentative ne dit pas qu'elle portait un code, si bien que le routeur retient
 * lui-même, à l'envoi, les identifiants de message des codes acceptés ; l'accusé `failed`
 * ({@see DeliveryAttemptUpdater}) les retrouve. Les deux clés vivent 15 minutes, de l'ordre du délai
 * de renvoi : un accusé plus tardif ne change plus rien.
 *
 * Les codes ne partent que par SMS (`SmsChannel`, envois directs au routeur) : WhatsApp n'a rien à
 * retenir ici.
 */
class OtpLateFailureMemory
{
    public const TTL_SECONDS = 900;

    public function rememberSent(string $provider, string $providerMessageId, string $number): void
    {
        Cache::put(self::sentKey($provider, $providerMessageId), $number, self::TTL_SECONDS);
    }

    /** Appelé au passage d'une tentative à `failed` : sans effet si elle ne portait pas un code. */
    public function recordFailure(string $provider, ?string $providerMessageId): void
    {
        if ($providerMessageId === null || $providerMessageId === '') {
            return;
        }
        $number = Cache::pull(self::sentKey($provider, $providerMessageId));
        if (! is_string($number) || $number === '') {
            return;
        }
        $failed = $this->failedProviders($number);
        if (! in_array($provider, $failed, true)) {
            $failed[] = $provider;
        }
        Cache::put(self::failedKey($number), $failed, self::TTL_SECONDS);
    }

    /** @return list<string> */
    public function failedProviders(string $number): array
    {
        $failed = Cache::get(self::failedKey($number));

        return is_array($failed) ? array_values(array_filter($failed, 'is_string')) : [];
    }

    private static function sentKey(string $provider, string $providerMessageId): string
    {
        return 'sms-otp:sent:'.$provider.':'.sha1($providerMessageId);
    }

    private static function failedKey(string $number): string
    {
        return 'sms-otp:failed:'.$number;
    }
}
