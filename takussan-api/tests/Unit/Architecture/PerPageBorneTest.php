<?php

namespace Tests\Unit\Architecture;

use App\Http\Controllers\Base\Controller;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-654 (piste P02.02) — aucun contrôleur ne recopie `per_page` sans plafond.
 *
 * Mesuré le 2026-10-15 : 26 lectures de `per_page` sur la requête, dans 26 contrôleurs, étaient
 * passées telles quelles à `paginate()`. `HasQueryBuilder::PER_PAGE_MAX` ne borne que le
 * `paginate()` sans argument, et `per_page=1000` sur les membres d'agence rendait 1 000 lignes.
 *
 * La règle, par ligne : une lecture `$request->input|query|integer|get|string('per_page'…)`
 * dans `app/Http/Controllers` porte son plafond **sur la même ligne** (`min(`), ou passe par
 * {@see Controller::tailleDePage()}, seul point exempté. Les lectures de
 * `validated()` ne sont pas visées : la FormRequest les borne déjà par `max:`.
 *
 * La garde se garde elle-même : un balayage qui ne voit presque rien rougit.
 */
class PerPageBorneTest extends TestCase
{
    private const LECTURE = '/\$request->(input|query|integer|get|string)\(\s*[\'"]per_page[\'"]/';

    private const CANONIQUE = 'Base/Controller.php';

    /**
     * @return array{fichiers: int, lectures: int, fautes: list<string>}
     */
    private function balayer(string $dossier): array
    {
        $fichiers = 0;
        $lectures = 0;
        $fautes = [];

        $iterateur = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dossier));
        foreach ($iterateur as $fichier) {
            if (! $fichier->isFile() || $fichier->getExtension() !== 'php') {
                continue;
            }
            $fichiers++;
            $relatif = substr($fichier->getPathname(), strlen($dossier) + 1);
            if ($relatif === self::CANONIQUE) {
                continue;
            }
            foreach (file($fichier->getPathname()) as $i => $ligne) {
                if (preg_match(self::LECTURE, $ligne) !== 1) {
                    continue;
                }
                $lectures++;
                if (! str_contains($ligne, 'min(')) {
                    $fautes[] = $relatif.':'.($i + 1).' — '.trim($ligne);
                }
            }
        }

        return ['fichiers' => $fichiers, 'lectures' => $lectures, 'fautes' => $fautes];
    }

    public function test_aucun_per_page_lu_sur_la_requete_ne_part_sans_plafond(): void
    {
        $resultat = $this->balayer(dirname(__DIR__, 3).'/app/Http/Controllers');

        // Plancher de plausibilité : ~200 contrôleurs et une vingtaine de lectures bornées sur
        // place le 2026-10-15. Un dossier renommé ou vidé rendrait « 0 faute » sans rien voir.
        $this->assertGreaterThan(100, $resultat['fichiers'], 'le balayage ne voit presque aucun contrôleur');
        $this->assertGreaterThan(5, $resultat['lectures'], 'le balayage ne voit presque aucune lecture de per_page');

        $this->assertSame(
            [],
            $resultat['fautes'],
            "per_page lu sur la requête sans plafond : passer par \$this->tailleDePage(\$request, \$défaut[, \$max]).\n"
                .implode("\n", $resultat['fautes']),
        );
    }
}
