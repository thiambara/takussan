<?php

namespace App\Support;

/**
 * TCK-853 (P37.06) — la liste des mandataires de confiance, telle que `bootstrap/app.php` la passe
 * à `trustProxies()`, lue au même endroit par la sonde de santé.
 *
 * ⚠ `*` n'y vaut pas « tous » : le découpage par virgules en fait `['*']`, et `TrustProxies` ne
 * reconnaît le joker que sous forme de CHAÎNE (`$trustedIps === '*'`). Le tableau part tel quel à
 * Symfony, qui n'y voit aucune adresse : posé par erreur, `*` ne croit personne, et tous les
 * clients prennent l'IP du mandataire. Décision du porteur : pas de refus au démarrage, mais la
 * sonde `proxies` le dit `degraded` et le journal le crie (`HealthcheckService::proxies()`).
 */
final class TrustedProxyList
{
    public const DEFAUT = '127.0.0.1,::1';

    /** @return list<string> */
    public static function fromEnvironment(): array
    {
        return array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('TRUSTED_PROXIES', self::DEFAUT)),
        )));
    }

    /** @param  list<string>  $proxies */
    public static function hasWildcard(array $proxies): bool
    {
        return array_intersect($proxies, ['*', '**']) !== [];
    }
}
