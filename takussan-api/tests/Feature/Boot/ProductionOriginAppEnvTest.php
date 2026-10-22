<?php

namespace Tests\Feature\Boot;

use App\Http\Middleware\AddRobotsTagOutsideProduction;
use App\Support\ProductionOrigin;
use Illuminate\Container\Container;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Env;
use Illuminate\Support\Facades\Facade;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

/**
 * TCK-1358 (P106.03) — l'API servie sur l'origine de production refuse de démarrer si `APP_ENV`
 * n'y vaut pas exactement `production`. Avant, « être la production » se jugeait sur deux critères :
 * `APP_ENV` pour le filtre d'IP des accusés SMS, l'aperçu des codes et le pilote `log`, l'origine
 * d'`APP_URL` pour le seul refus de l'aperçu. Un `APP_ENV` resté `staging` (ou mal orthographié)
 * sur l'origine de production démarrait, filtre d'IP ouvert à tout appelant.
 */
class ProductionOriginAppEnvTest extends TestCase
{
    private const AUTRE_ORIGINE = 'https://preview.example.test';

    /**
     * Le démarrage entier, par `bootstrap/app.php` comme celui du déploiement : le CÂBLAGE dans le
     * démarrage est éprouvé, pas seulement la méthode (même harnais qu'`OtpPreviewTest`).
     */
    public function test_l_origine_de_production_avec_un_app_env_staging_refuse_de_demarrer(): void
    {
        $poser = ['OTP_PREVIEW_ENABLED' => 'false', 'APP_URL' => AddRobotsTagOutsideProduction::PRODUCTION_ORIGIN, 'APP_ENV' => 'staging'];
        $avant = [];
        foreach ($poser as $cle => $valeur) {
            $avant[$cle] = [$_ENV[$cle] ?? null, $_SERVER[$cle] ?? null, getenv($cle)];
            $_ENV[$cle] = $_SERVER[$cle] = $valeur;
            putenv("{$cle}={$valeur}");
        }
        Env::enablePutenv();

        try {
            $app = require base_path('bootstrap/app.php');
            $this->expectException(RuntimeException::class);
            $this->expectExceptionMessage('APP_ENV=staging');
            $app->make(Kernel::class)->bootstrap();
        } finally {
            foreach ($avant as $cle => [$env, $server, $getenv]) {
                if ($env === null) {
                    unset($_ENV[$cle]);
                } else {
                    $_ENV[$cle] = $env;
                }
                if ($server === null) {
                    unset($_SERVER[$cle]);
                } else {
                    $_SERVER[$cle] = $server;
                }
                putenv($getenv === false ? $cle : "{$cle}={$getenv}");
            }
            Env::enablePutenv();
            Container::setInstance($this->app);
            Facade::clearResolvedInstances();
            Facade::setFacadeApplication($this->app);
        }
    }

    /** @return array<string, array{string}> */
    public static function environnementsMalNommes(): array
    {
        return ['staging' => ['staging'], 'prod' => ['prod'], 'Production' => ['Production'], 'local' => ['local']];
    }

    #[DataProvider('environnementsMalNommes')]
    public function test_tout_app_env_autre_que_production_est_refuse_sur_l_origine_de_production(string $env): void
    {
        config(['app.url' => AddRobotsTagOutsideProduction::PRODUCTION_ORIGIN]);
        $this->app['env'] = $env;

        try {
            $this->expectException(RuntimeException::class);
            ProductionOrigin::refuserUnAutreAppEnv();
        } finally {
            $this->app['env'] = 'testing';
        }
    }

    public function test_la_production_et_les_autres_origines_demarrent(): void
    {
        config(['app.url' => AddRobotsTagOutsideProduction::PRODUCTION_ORIGIN]);
        $this->app['env'] = 'production';
        ProductionOrigin::refuserUnAutreAppEnv();

        config(['app.url' => self::AUTRE_ORIGINE]);
        $this->app['env'] = 'staging';
        ProductionOrigin::refuserUnAutreAppEnv();

        $this->app['env'] = 'testing';
        $this->addToAssertionCount(1);
    }
}
