<?php

namespace App\Support;

/**
 * P97.05 (TCK-1245) — LE lien vers une page du front, depuis un courriel ou une notification.
 *
 * Trois écritures de la base coexistaient : `config('app.frontend_url') ?: config('app.url')`
 * (la plupart), `config('app.frontend_url', config('app.url'))`, dont le repli ne joue jamais (la
 * clé est toujours définie, `config/app.php`), et `config('app.frontend_url')` sans repli. Les deux
 * dernières n'ôtaient pas non plus la barre finale : une base `https://front/` donnait
 * `https://front//app/profile`. Une seule forme désormais : la base du front, à défaut celle de
 * l'API, sans barre finale.
 *
 * `tests/Feature/Notifications/LiensDesCourrielsTest.php` rend chaque `toMail()` à bouton et exige
 * un lien sur cette base, vers une `page.tsx` qui existe.
 */
final class LienFront
{
    /** La base du front, sans barre finale. */
    public static function base(): string
    {
        return rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');
    }

    /** `$chemin` (qui commence par `/`, requête comprise) sur la base du front. */
    public static function vers(string $chemin): string
    {
        return self::base().'/'.ltrim($chemin, '/');
    }
}
