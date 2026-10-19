<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-967 (piste P45.04) — un contrôleur ne rend pas une ressource unique par `->toArray($request)`.
 *
 * `toArray()` appelé en direct saute `JsonResource::resolve()`, donc `filter()` : un `whenLoaded()`
 * sur une relation non chargée ou un `when()` faux restent des `MissingValue`, que la réponse rend
 * en `{}` au lieu d'omettre la clé. Mesuré le 2026-10-18 sur `POST …/visit-request`
 * (`"property":{},"visitor":{},…`) ; 148 appels de cette forme dans `app/Http/Controllers`.
 *
 * La règle : l'expression qui précède `->toArray($request)` (depuis le dernier `=>`, `return`, `=`,
 * `;` ou `{`) ne construit pas une ressource unique (`::make(` ou `new …Resource(`). Une collection
 * (`::collection(`) reste permise : `ResourceCollection::toArray()` résout déjà chaque élément.
 *
 * La garde se garde elle-même : un balayage qui ne voit presque rien rougit.
 */
class RessourceUniqueResolueTest extends TestCase
{
    private const APPEL = '->toArray($request)';

    /**
     * @return array{fichiers: int, appels: int, fautes: list<string>}
     */
    public static function balayer(string $dossier): array
    {
        $fichiers = 0;
        $appels = 0;
        $fautes = [];

        $iterateur = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dossier));
        foreach ($iterateur as $fichier) {
            if (! $fichier->isFile() || $fichier->getExtension() !== 'php') {
                continue;
            }
            $fichiers++;
            $source = (string) file_get_contents($fichier->getPathname());
            $relatif = substr($fichier->getPathname(), strlen($dossier) + 1);

            $position = 0;
            while (($trouve = strpos($source, self::APPEL, $position)) !== false) {
                $position = $trouve + strlen(self::APPEL);
                $appels++;
                $expression = self::expressionAvant(substr($source, 0, $trouve));
                if (str_contains($expression, '::collection(')) {
                    continue;
                }
                if (preg_match('/::make\(|new\s+\\\\?[\w\\\\]*Resource\(/', $expression) === 1) {
                    $ligne = substr_count($source, "\n", 0, $trouve) + 1;
                    $fautes[] = $relatif.':'.$ligne;
                }
            }
        }

        return ['fichiers' => $fichiers, 'appels' => $appels, 'fautes' => $fautes];
    }

    private static function expressionAvant(string $avant): string
    {
        $debut = 0;
        foreach (['=>', 'return ', '= ', ';', '{'] as $borne) {
            $p = strrpos($avant, $borne);
            if ($p !== false && $p + strlen($borne) > $debut) {
                $debut = $p + strlen($borne);
            }
        }

        return substr($avant, $debut);
    }

    public function test_aucune_ressource_unique_n_est_rendue_par_to_array(): void
    {
        $bilan = self::balayer(dirname(__DIR__, 3).'/app/Http/Controllers');

        $this->assertGreaterThan(100, $bilan['fichiers'], 'le balayage ne voit presque aucun contrôleur');
        $this->assertSame([], $bilan['fautes'], "->resolve(\$request) au lieu de ->toArray(\$request) sur une ressource unique :\n".implode("\n", $bilan['fautes']));
    }

    public function test_la_garde_voit_les_trois_formes(): void
    {
        $dossier = sys_get_temp_dir().'/garde-ressource-'.getmypid();
        @mkdir($dossier);
        file_put_contents($dossier.'/Exemple.php', <<<'PHP'
            <?php
            return [
                'a' => FooResource::make($x)->toArray($request),
                'b' => new BarResource($y)->toArray($request),
                'c' => BazResource::make($z)
                    ->forViewer($u)
                    ->toArray($request),
                'd' => FooResource::collection($l)->toArray($request),
                'e' => FooResource::make($x)->resolve($request),
            ];
            PHP);

        try {
            $bilan = self::balayer($dossier);
        } finally {
            unlink($dossier.'/Exemple.php');
            rmdir($dossier);
        }

        $this->assertSame(4, $bilan['appels']);
        $this->assertSame(['Exemple.php:3', 'Exemple.php:4', 'Exemple.php:7'], $bilan['fautes']);
    }
}
