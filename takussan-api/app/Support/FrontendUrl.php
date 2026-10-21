<?php

namespace App\Support;

/**
 * P97.05 (TCK-1185) — la SEULE façon de bâtir un lien vers une page du front.
 *
 * Trois écritures coexistaient : `rtrim(config('app.frontend_url') ?: config('app.url'), '/')`
 * (la plupart), `config('app.frontend_url', config('app.url'))` — qui ne se repliait JAMAIS, la clé
 * étant toujours définie (`config/app.php`), et collait une seconde barre derrière une base finie
 * par `/` — et `config('app.frontend_url')` sans repli. Vide, ces deux dernières sortaient un lien
 * relatif, inutilisable dans un courriel.
 *
 * `tests/Feature/Notifications/MailActionLinksTest.php` rend chaque bouton de courriel et exige
 * cette base, et une page du front au bout du chemin.
 */
final class FrontendUrl
{
    /** La base du front, sans barre finale : `app.frontend_url`, à défaut `app.url`. */
    public static function base(): string
    {
        return rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');
    }

    /** `$path` (chemin et requête) sur la base du front ; la barre initiale est ajoutée au besoin. */
    public static function to(string $path = '/'): string
    {
        return self::base().'/'.ltrim($path, '/');
    }
}
