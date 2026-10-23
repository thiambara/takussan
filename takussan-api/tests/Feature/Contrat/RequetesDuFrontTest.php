<?php

namespace Tests\Feature\Contrat;

use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\OperateursPlateforme;

/**
 * TCK-1800 (P150.04) — les requêtes de lecture que le front écrit, rejouées telles quelles.
 *
 * `tests/fixtures/requetes-du-front.json` est DÉRIVÉ des fonctions et des hooks de
 * `takussan-web/src/lib/queries` (`node scripts/gen-requetes-du-front.mjs`, depuis
 * `takussan-web/`), et la suite du front rougit s'il ne les suit plus. Ce test les envoie à l'API,
 * chacune par l'acteur qui la fait : un `sort`, un `filter[…]`, un `include` ou un `fields` que la
 * liste blanche du modèle ne déclare pas rend 400, et le fait rougir ici.
 *
 * Avant lui, quatre écarts de ce genre ont vécu de 15 jours à deux mois sans qu'aucun test ne
 * rougisse (P150.01 à P150.03, P118.01).
 */
class RequetesDuFrontTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use OperateursPlateforme;
    use RefreshDatabase;

    private const FICHIER = __DIR__.'/../../fixtures/requetes-du-front.json';

    /** @return array<string, array{0: string, 1: string, 2: array<string, string>}> */
    public static function requetes(): array
    {
        $contenu = json_decode((string) file_get_contents(self::FICHIER), true, flags: JSON_THROW_ON_ERROR);

        $cas = [];
        foreach ($contenu['requetes'] as $requete) {
            $cas[$requete['source']] = [$requete['acteur'], $requete['chemin'], $requete['parametres']];
        }

        return $cas;
    }

    public function test_le_fichier_porte_des_requetes_des_deux_acteurs(): void
    {
        $acteurs = array_unique(array_column(self::requetes(), 0));
        sort($acteurs);

        $this->assertSame(['agence', 'operateur'], $acteurs);
    }

    /** @param  array<string, string>  $parametres */
    #[DataProvider('requetes')]
    public function test_la_requete_du_front_est_acceptee_par_l_api(string $acteur, string $chemin, array $parametres): void
    {
        $url = $chemin.($parametres === [] ? '' : '?'.http_build_query($parametres));

        $reponse = match ($acteur) {
            'agence' => $this->actingAsApi($this->agencyAdmin(Agency::factory()->create()))->apiGet($url),
            'operateur' => $this->enOperateur()->getJson($url),
        };

        $this->assertNotSame(400, $reponse->status(), "{$url} → 400 : ".$reponse->getContent());
        $reponse->assertOk();
    }

    private function enOperateur(): static
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        return $this;
    }
}
