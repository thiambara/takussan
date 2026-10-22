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
 *
 * P72.04 (TCK-1354) — l'envoi d'un code nomme aussi la clé de cache de son délai de renvoi
 * (`otp_resend_key` du contexte du routeur) : l'accusé `failed` la retire, et le destinataire peut
 * redemander un code tout de suite, au lieu d'attendre la fin d'un délai posé pour un code qui
 * n'arrivera pas. Une fois par code : l'entrée de l'envoi est consommée par le premier `failed`.
 * Les autres bornes (plafond par numéro, plafond du jour, limiteurs de route) restent.
 */
class OtpLateFailureMemory
{
    public const TTL_SECONDS = 900;

    public function rememberSent(string $provider, string $providerMessageId, string $number, ?string $resendKey = null): void
    {
        Cache::put(
            self::sentKey($provider, $providerMessageId),
            ['number' => $number, 'resend_key' => $resendKey],
            self::TTL_SECONDS,
        );
    }

    /** Appelé au passage d'une tentative à `failed` : sans effet si elle ne portait pas un code. */
    public function recordFailure(string $provider, ?string $providerMessageId): void
    {
        if ($providerMessageId === null || $providerMessageId === '') {
            return;
        }
        $sent = Cache::pull(self::sentKey($provider, $providerMessageId));
        // Une entrée écrite avant TCK-1354 ne porte que le numéro.
        $number = is_array($sent) ? ($sent['number'] ?? null) : $sent;
        if (! is_string($number) || $number === '') {
            return;
        }
        $resendKey = is_array($sent) ? ($sent['resend_key'] ?? null) : null;
        if (is_string($resendKey) && $resendKey !== '') {
            Cache::forget($resendKey);
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
