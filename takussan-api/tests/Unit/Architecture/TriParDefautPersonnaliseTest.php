<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * Relevé de back-3 (2026-11-13) — un tri par défaut écrit en CHAÎNE (`defaultSort('-priority')`,
 * `defaultSortsWithRelevance('-priority', …)`) devient chez spatie un `AllowedSort::field()` : il trie
 * la colonne brute, jamais le tri personnalisé déclaré sous le même nom (`AllowedSort::custom(…)`).
 * La priorité d'une intervention se triait ainsi comme du texte (`urgent`, `normal`, `low`, `high`) à
 * côté d'un `sort=-priority` par rang, et les cibles d'attribution (`/members`) dans l'ordre des
 * octets à côté d'un `sort=first_name` collationné.
 *
 * La garde : aucun appel de tri par défaut dans `app/` ne nomme en chaîne une clé qu'un
 * `AllowedSort::custom()` de `app/` déclare. Il passe l'`AllowedSort` (`MaintenanceRequest::triParDefaut()`,
 * `User::nameSorts()`).
 *
 * **Limites** : le croisement est par NOM, tous modèles confondus — un homonyme sans tri personnalisé
 * sur SON modèle rougirait aussi (et se déclare alors en exception motivée) ; un tri par défaut
 * construit dans une variable ou une méthode n'est pas lu. La garde est un plancher.
 */
class TriParDefautPersonnaliseTest extends TestCase
{
    /**
     * Le fichier et la clé, puis la raison.
     *
     * @var array<string, string>
     */
    private const EXCEPTIONS = [
        // La route de l'observatoire pose `withCount('listings as listings_count')` avec le même
        // décompte que `RadarAdvertiserListingsSort` (`RadarAdvertiserRanking::liveListings()`) : la
        // chaîne trie l'alias, qui EST ce rang. Le tri personnalisé n'existe que pour les routes qui
        // ne posent pas cet alias.
        'Http/Controllers/Api/Admin/RadarObservatoryController.php:listings_count' => 'alias withCount du même décompte',
    ];

    public function test_aucun_tri_par_defaut_en_chaine_sur_une_cle_a_tri_personnalise(): void
    {
        $app = dirname(__DIR__, 3).'/app';

        $personnalises = [];
        foreach ($this->fichiers($app) as $chemin) {
            preg_match_all("/AllowedSort::custom\\(\\s*'-?(\\w+)'/", (string) file_get_contents($chemin), $m);
            foreach ($m[1] as $cle) {
                $personnalises[$cle] = true;
            }
        }
        $this->assertGreaterThan(10, count($personnalises), 'Trop peu de tris personnalisés lus : la garde ne voit plus `AllowedSort::custom()`.');

        $appels = 0;
        $vus = [];
        $fautes = [];
        foreach ($this->fichiers($app) as $chemin) {
            $relatif = substr($chemin, strlen($app) + 1);
            foreach ($this->argumentsDesTrisParDefaut((string) file_get_contents($chemin)) as $arguments) {
                $appels++;
                foreach ($this->chainesDeTete($arguments) as $cle) {
                    if (! isset($personnalises[$cle])) {
                        continue;
                    }
                    $vus[$relatif.':'.$cle] = true;
                    if (! isset(self::EXCEPTIONS[$relatif.':'.$cle])) {
                        $fautes[] = "{$relatif} : tri par défaut `'{$cle}'` en chaîne, alors qu'un `AllowedSort::custom('{$cle}', …)` existe — spatie triera la colonne brute. Passer l'AllowedSort.";
                    }
                }
            }
        }
        $this->assertGreaterThan(30, $appels, 'Trop peu de tris par défaut lus : la lecture des appels est cassée.');

        foreach (array_keys(self::EXCEPTIONS) as $cle) {
            if (! isset($vus[$cle])) {
                $fautes[] = "{$cle} : l'exception ne s'applique plus à aucun tri par défaut — la retirer.";
            }
        }

        $this->assertSame([], $fautes, "Tri par défaut qui contourne un tri personnalisé :\n".implode("\n", $fautes));
    }

    public function test_la_lecture_voit_les_formes_du_depot(): void
    {
        $code = <<<'PHP'
            <?php
            $q->defaultSort('-created_at')
              ->defaultSorts(...M::defaultSortsWithRelevance('-priority', '-created_at'));
            $q->defaultSorts(M::prioritySort('-priority'), 'id');
            $q->defaultSort(AllowedSort::custom('etat', new S), '-created_at');
            PHP;

        $this->assertSame(
            [['created_at'], [], ['priority', 'created_at'], ['id'], ['created_at']],
            array_map(fn (string $a): array => $this->chainesDeTete($a), $this->argumentsDesTrisParDefaut($code)),
        );
    }

    /**
     * Les arguments de chaque `defaultSort(`, `defaultSorts(` et `defaultSortsWithRelevance(`, hors
     * déclaration de méthode.
     *
     * @return list<string>
     */
    private function argumentsDesTrisParDefaut(string $code): array
    {
        $arguments = [];
        preg_match_all('/(?<!function\s)\b(?:defaultSorts?|defaultSortsWithRelevance)\s*\(/', $code, $m, PREG_OFFSET_CAPTURE);
        foreach ($m[0] as [$tout, $position]) {
            $debut = $position + strlen($tout);
            $profondeur = 1;
            for ($j = $debut, $n = strlen($code); $j < $n && $profondeur > 0; $j++) {
                $profondeur += match ($code[$j]) {
                    '(' => 1,
                    ')' => -1,
                    default => 0,
                };
            }
            $arguments[] = substr($code, $debut, $j - 1 - $debut);
        }

        return $arguments;
    }

    /**
     * Les chaînes passées EN ARGUMENT de premier niveau (pas celles d'un appel imbriqué, comme le nom
     * d'un `AllowedSort::custom('etat', …)` ou d'un `prioritySort('-priority')`), sans leur `-`.
     *
     * @return list<string>
     */
    private function chainesDeTete(string $arguments): array
    {
        $cles = [];
        $profondeur = 0;
        for ($j = 0, $n = strlen($arguments); $j < $n; $j++) {
            $c = $arguments[$j];
            if ($c === '(' || $c === '[') {
                $profondeur++;
            } elseif ($c === ')' || $c === ']') {
                $profondeur--;
            } elseif ($c === "'" && $profondeur === 0 && preg_match("/\\G'-?(\\w+)'/", $arguments, $m, 0, $j) === 1) {
                $cles[] = $m[1];
                $j += strlen($m[0]) - 1;
            }
        }

        return $cles;
    }

    /** @return list<string> */
    private function fichiers(string $dossier): array
    {
        $chemins = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dossier, RecursiveDirectoryIterator::SKIP_DOTS)) as $fichier) {
            if ($fichier->getExtension() === 'php') {
                $chemins[] = $fichier->getPathname();
            }
        }
        sort($chemins);

        return $chemins;
    }
}
