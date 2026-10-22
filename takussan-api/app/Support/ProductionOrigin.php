<?php

namespace App\Support;

use App\Http\Middleware\AddRobotsTagOutsideProduction;
use App\Services\Auth\OtpPreview;
use RuntimeException;

/**
 * P106.03 (TCK-1358) — « être la production » se jugeait sur deux critères : `APP_ENV` pour le
 * filtre d'IP des accusés SMS (`RestrictIpMiddleware`), l'aperçu des codes (`OtpPreview`) et le
 * pilote `log` ; l'origine d'`APP_URL` pour `X-Robots-Tag` et le refus de démarrer de l'aperçu. Une
 * API servie sur l'origine de production avec un `APP_ENV` resté `staging`, ou mal orthographié
 * (`prod`, `Production`), démarrait, filtre d'IP ouvert à tout appelant tant qu'une liste manque.
 *
 * Au démarrage, les deux critères doivent donc dire la même chose sur l'origine de production.
 * Bruyant à dessein, comme {@see OtpPreview::refuserSurLaProduction()} : le
 * `release` du déploiement échoue, et l'ancienne API continue de servir.
 */
final class ProductionOrigin
{
    public static function refuserUnAutreAppEnv(): void
    {
        if (! AddRobotsTagOutsideProduction::isProduction((string) config('app.url'))) {
            return;
        }
        $env = (string) app()->environment();
        if ($env !== 'production') {
            throw new RuntimeException(
                "APP_ENV={$env} sur l'API de production (APP_URL = ".AddRobotsTagOutsideProduction::PRODUCTION_ORIGIN.') : '
                .'le filtre d\'IP des accusés et les autres gardes jugées sur APP_ENV y seraient ouverts. '
                .'Poser APP_ENV=production dans l\'environnement de production (P106.03).'
            );
        }
    }
}
