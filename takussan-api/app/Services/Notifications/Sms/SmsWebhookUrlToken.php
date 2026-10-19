<?php

namespace App\Services\Notifications\Sms;

use Illuminate\Contracts\Config\Repository as ConfigRepository;

/**
 * P36.04 (TCK-943) — le jeton d'URL des accusés SMS, un par fournisseur.
 *
 * Le jeton propre au fournisseur (`sms.webhook_url_tokens.{fournisseur}`), s'il est posé, est le
 * SEUL accepté sur sa route et le seul écrit dans l'URL de retour qu'on lui envoie. Sinon, repli
 * sur la clé commune `sms.webhook_url_token`, le temps de la bascule. Ainsi le jeton que LAM reçoit
 * dans chaque `ret_url` (et garde dans ses journaux) n'ouvre plus les routes d'Orange et de
 * Mtarget, et sa rotation ne touche que LAM.
 *
 * Échec fermé : aucun des deux posé → jeton vide → la route rend 404.
 */
final class SmsWebhookUrlToken
{
    public static function for(string $provider, ConfigRepository $config): string
    {
        $own = (string) $config->get("sms.webhook_url_tokens.{$provider}", '');

        return $own !== '' ? $own : (string) $config->get('sms.webhook_url_token', '');
    }

    public static function accepts(string $provider, string $candidate, ConfigRepository $config): bool
    {
        $token = self::for($provider, $config);

        return $token !== '' && hash_equals($token, $candidate);
    }
}
