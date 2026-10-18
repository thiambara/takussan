<?php

namespace Tests\Feature\Middleware;

use App\Http\Middleware\AddRobotsTagOutsideProduction;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-926 (P34.05) — hors de la production, toute réponse de l'API porte
 * `X-Robots-Tag: noindex, nofollow`.
 *
 * Avant, `public/robots.txt` valait `Disallow:` (tout permis) et `/` rendait la vue `welcome` en
 * HTML, en préproduction comme en production : rien ne tenait un moteur hors de l'index. L'origine
 * de production se compare à celle d'`APP_URL` ; aucune variable neuve.
 */
class AddRobotsTagOutsideProductionTest extends TestCase
{
    /** @return array<string, array{string}> */
    public static function chemins(): array
    {
        return [
            'la page d’accueil HTML' => ['/'],
            'une route api/' => ['/api/maintenance/status'],
            'une route absente' => ['/api/route-qui-n-existe-pas'],
        ];
    }

    #[DataProvider('chemins')]
    public function test_hors_production_toute_reponse_porte_noindex(string $chemin): void
    {
        config(['app.url' => 'https://preview.api.example.org']);

        $this->get($chemin)->assertHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    #[DataProvider('chemins')]
    public function test_en_production_rien_n_est_pose(string $chemin): void
    {
        config(['app.url' => AddRobotsTagOutsideProduction::PRODUCTION_ORIGIN]);

        $this->get($chemin)->assertHeaderMissing('X-Robots-Tag');
    }

    public function test_l_origine_se_compare_sans_barre_finale_ni_casse(): void
    {
        config(['app.url' => strtoupper(AddRobotsTagOutsideProduction::PRODUCTION_ORIGIN).'/']);

        $this->get('/')->assertHeaderMissing('X-Robots-Tag');
    }

    public function test_un_chemin_de_base_ne_change_pas_l_origine(): void
    {
        config(['app.url' => AddRobotsTagOutsideProduction::PRODUCTION_ORIGIN.'/base']);

        $this->get('/')->assertHeaderMissing('X-Robots-Tag');
    }
}
