<?php

namespace Tests\Support;

/**
 * Les sept règles qui transforment un diff en liste de tests.
 *
 * ⚠ CINQ de ces règles existent pour ESCALADER, pas pour sélectionner. L'asymétrie
 * est délibérée : sélectionner trop coûte des secondes, sélectionner trop peu
 * produit un FAUX VERT — et un faux vert sur une garde ne se distingue pas d'un
 * vrai vert. En cas de doute, escalader.
 *
 * ⚠ Cette classe ne touche NI git NI le disque. Tout ce qui vient du monde
 * extérieur est injecté par `select()`, ce qui la rend testable sans dépôt
 * factice et sans processus fils.
 *
 * Ce que ces règles ne savent PAS faire, et pourquoi (cf. la conception) :
 *   · un fichier de `routes/` ne se cartographie pas — il s'exécute à
 *     l'enregistrement, donc au démarrage, donc dans TOUS les tests. D'où le
 *     repli sur les noms de classes cités dans le diff.
 *   · une migration non plus — elle s'exécute une fois par processus, attribuée
 *     au premier test. Elle reste un déclencheur dur, et c'est correct : une
 *     migration change le schéma sous tous les tests.
 */
final class ImpactSelector
{
    private const API_PREFIX = 'takussan-api/';

    /** Préfixes dont la modification invalide TOUTE la suite. */
    private const HARD_PREFIXES = [
        'database/migrations/',  // Modifie le schéma sous TOUS les tests.
        'database/factories/',   // Consommée par un nombre inconnu de tests ; on ne sait pas lesquels.
        'database/seeders/',     // Idem : modifie la fixture de base de tous les tests.
        'bootstrap/',
    ];

    /** Fichiers dont la modification invalide TOUTE la suite. */
    private const HARD_FILES = [
        'composer.lock',
        'composer.json',
        'phpunit.xml',
        'tests/bootstrap.php',
        'tests/TestCase.php',
    ];

    /** Préfixes qu'on ne sait pas cartographier, mais dont on sait extraire des noms de classe. */
    private const RESOLVED_FROM_DIFF = [
        'routes/',
        'config/',
    ];

    public function __construct(private readonly ImpactMap $map) {}

    /**
     * @param  list<string>  $changedPaths  chemins relatifs à la RACINE du dépôt
     * @param  callable(string):string  $diffFor  rend le diff unifié d'un chemin
     * @param  list<string>  $testClassesSinceMapCommit  noms COMPLETS
     */
    public function select(array $changedPaths, callable $diffFor, array $testClassesSinceMapCommit): ImpactSelection
    {
        $selected = array_fill_keys($testClassesSinceMapCommit, true);

        foreach ($changedPaths as $path) {
            if (! str_starts_with($path, self::API_PREFIX)) {
                continue;
            }

            $relative = substr($path, strlen(self::API_PREFIX));

            if (in_array($relative, self::HARD_FILES, true)) {
                return ImpactSelection::full("fichier global modifié : $relative");
            }

            foreach (self::HARD_PREFIXES as $prefix) {
                if (str_starts_with($relative, $prefix)) {
                    return ImpactSelection::full("fichier global modifié : $relative");
                }
            }

            if (str_starts_with($relative, 'tests/')) {
                $class = ImpactMap::classForFile($relative);
                if ($class !== null) {
                    $selected[$class] = true;
                }

                continue;
            }

            foreach (self::RESOLVED_FROM_DIFF as $prefix) {
                if (! str_starts_with($relative, $prefix)) {
                    continue;
                }

                $resolved = $this->classesNamedIn($diffFor($path));
                if ($resolved === []) {
                    return ImpactSelection::full("aucune classe applicative résolue dans $relative");
                }

                foreach ($resolved as $class) {
                    $selected[$class] = true;
                }

                continue 2;
            }

            if (! str_starts_with($relative, 'app/')) {
                continue;
            }

            $classes = $this->map->classesFor($relative);

            if ($classes === null) {
                return ImpactSelection::full("fichier absent de la carte : $relative");
            }

            foreach ($classes as $class) {
                $selected[$class] = true;
            }
        }

        return ImpactSelection::partial(array_keys($selected));
    }

    /**
     * Les classes de test qui couvrent les classes applicatives CITÉES dans les
     * lignes ajoutées ou retirées d'un diff.
     *
     * ⚠ EN DEUX TEMPS, et pas en une seule expression rationnelle. Une regex
     * ancrée sur `^[+-]` ne rend qu'UNE occurrence par ligne : une ligne qui cite
     * deux contrôleurs n'en livrerait qu'un, et sélectionner trop peu produit un
     * faux vert. On isole d'abord les lignes, on cherche ensuite tous les noms.
     *
     * @return list<string>
     */
    private function classesNamedIn(string $diff): array
    {
        $names = [];

        foreach (explode("\n", $diff) as $line) {
            if ($line === '' || ($line[0] !== '+' && $line[0] !== '-')) {
                continue;
            }

            // Les en-têtes de diff (`+++ b/…`, `--- a/…`) ne sont pas du contenu.
            if (str_starts_with($line, '+++') || str_starts_with($line, '---')) {
                continue;
            }

            preg_match_all(
                '/\b([A-Z][A-Za-z0-9_]*(?:Controller|Service|Middleware|Resource|Job|Listener))\b/',
                $line,
                $matches,
            );

            foreach ($matches[1] as $name) {
                $names[$name] = true;
            }
        }

        $selected = [];
        foreach (array_keys($names) as $basename) {
            foreach ($this->map->scannedByBasename($basename) as $appFile) {
                foreach ($this->map->classesFor($appFile) ?? [] as $class) {
                    $selected[$class] = true;
                }
            }
        }

        return array_keys($selected);
    }
}
