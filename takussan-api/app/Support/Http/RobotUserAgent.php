<?php

namespace App\Support\Http;

/**
 * TCK-792 (P18.04, décision du porteur) — reconnaît un robot à son agent, par une liste courte
 * sans dépendance : les moteurs, les aperçus de liens des réseaux et les clients HTTP en ligne de
 * commande. Ce n'est pas une défense : un robot qui se déguise en navigateur passe. Le but est de
 * ne pas compter une impression sponsorisée à ceux qui se déclarent.
 *
 * Un agent absent ou vide n'est pas jugé robot : le rendu serveur du front transmet l'agent du
 * visiteur, mais un appel qui n'en porte aucun reste compté comme avant.
 */
final class RobotUserAgent
{
    /**
     * `bot` en fin de mot couvre Googlebot, bingbot, Applebot, AdsBot-Google, Twitterbot… sans
     * prendre les téléphones Android de la marque Cubot (« CUBOT NOTE 20 ») : d'où le
     * `(?<!cu)`. Le doute laisse compter : exclure un vrai visiteur coûte plus qu'en compter un faux.
     */
    public const PATTERN = '~(?<!cu)bot\\b|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|headlesschrome|lighthouse|^curl/|^wget/|python-requests|go-http-client|scrapy~i';

    public static function is(?string $userAgent): bool
    {
        if ($userAgent === null || trim($userAgent) === '') {
            return false;
        }

        return preg_match(self::PATTERN, $userAgent) === 1;
    }
}
