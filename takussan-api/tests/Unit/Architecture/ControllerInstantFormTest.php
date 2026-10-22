<?php

namespace Tests\Unit\Architecture;

use App\Http\Resources\Bases\BaseResource;
use Carbon\Carbon;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-1504 (P94.03) — un instant composé à la main dans `app/Http/Controllers` ou
 * `app/Services/Admin` sort par `Base\Controller::instant()` (ou `BaseResource::instantOnWire()`
 * hors d'un contrôleur) : `2026-08-17T12:34:56+00:00`, la forme d'ADR-0018.
 *
 * Avant ce ticket, deux conversions écrites à la main cohabitaient — `toISOString()`
 * (`….000000Z`, 25 sites) et `toIso8601String()` (`…+00:00`, 55 sites) —, parfois dans une même
 * réponse. C'est la liste noire de ces deux appels, sans inventaire positif : elle ne voit ni un
 * Carbon rendu brut, ni `toDateString()`/`format()`.
 */
class ControllerInstantFormTest extends TestCase
{
    /**
     * Les exceptions, chacune avec sa raison et sa sortie. Une exception qui ne s'applique plus à
     * rien fait rougir le test : la retirer.
     *
     * @var array<string, string>
     */
    private const EXCEPTIONS = [
        // `/api/payments/history` : la clé `date` d'une échéance impayée est figée en
        // `….000000Z` par TCK-1500 (P94.04, PR ouverte au même moment). Convertir ici rendrait
        // `pre-dev` rouge à la fusion des deux : à passer par `instant()` une fois TCK-1500 fusionné.
        'Http/Controllers/Api/PaymentController.php' => 'TCK-1500',
    ];

    public function test_aucune_conversion_d_instant_ecrite_a_la_main(): void
    {
        $app = dirname(__DIR__, 3).'/app';
        $fautes = [];
        $lus = 0;
        $exceptionsVues = [];

        foreach (['Http/Controllers', 'Services/Admin'] as $dossier) {
            $racine = $app.'/'.$dossier;
            $this->assertDirectoryExists($racine);
            $fichiers = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine, RecursiveDirectoryIterator::SKIP_DOTS));
            foreach ($fichiers as $fichier) {
                if ($fichier->getExtension() !== 'php') {
                    continue;
                }
                $lus++;
                $relatif = substr($fichier->getPathname(), strlen($app) + 1);
                $code = $this->sansCommentaires((string) file_get_contents($fichier->getPathname()));
                if (preg_match_all('/->\s*(toISOString|toIso8601String)\s*\(/', $code, $m) > 0) {
                    if (isset(self::EXCEPTIONS[$relatif])) {
                        $exceptionsVues[$relatif] = true;

                        continue;
                    }
                    $fautes[] = $relatif.' : '.implode(', ', array_unique($m[1]));
                }
            }
        }

        // Non-vacuité : un chemin faux ne doit pas rendre un vert vide.
        $this->assertGreaterThan(150, $lus, 'Trop peu de fichiers lus : la garde ne regarde plus le bon dossier.');
        $this->assertSame([], $fautes, "Instant converti à la main : passer par `\$this->instant(…)` (contrôleur) ou `BaseResource::instantOnWire(…)`.\n".implode("\n", $fautes));
        $this->assertSame(
            array_keys(self::EXCEPTIONS),
            array_keys($exceptionsVues),
            'Une exception ne s\'applique plus à rien : la retirer de EXCEPTIONS.'
        );
    }

    public function test_le_helper_rend_la_forme_d_adr_0018(): void
    {
        $paris = Carbon::parse('2026-10-18 23:54:01.123456', 'Europe/Paris');

        $this->assertSame('2026-10-18T21:54:01+00:00', BaseResource::instantOnWire($paris));
        $this->assertSame('Europe/Paris', $paris->getTimezone()->getName(), "Le helper ne modifie pas l'instance reçue.");
        $this->assertNull(BaseResource::instantOnWire(null));
        $this->assertSame('2026-10-18', BaseResource::calendarDateOnWire($paris));
    }

    private function sansCommentaires(string $source): string
    {
        $code = '';
        foreach (token_get_all($source) as $jeton) {
            if (is_array($jeton) && in_array($jeton[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }
            $code .= is_array($jeton) ? $jeton[1] : $jeton;
        }

        return $code;
    }
}
