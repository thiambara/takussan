<?php

namespace Tests\Support;

/**
 * Les huit règles qui transforment un diff en liste de tests.
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
 *   · `config/` NE PASSE PLUS par le même repli que `routes/` (cf. la revue de
 *     branche, constat I-6). Pour `routes/`, l'arête route → contrôleur borne
 *     réellement l'impact : une route qui ne cite aucun contrôleur reconnu peut
 *     raisonnablement escalader. Pour `config/`, cette arête n'existe pas — une
 *     valeur de configuration est lue globalement, et le fait qu'une ligne du
 *     diff mentionne `PropertySearchService` ne dit rien de la portée réelle du
 *     changement. Le repli protégeait la MAJORITÉ des cas (la plupart des diffs
 *     de `config/` ne citent aucune classe à suffixe reconnu, et escaladaient
 *     déjà) mais le cas où il RÉSOUT est précisément celui où l'outil pouvait se
 *     tromper à la baisse sur un fichier global. `config/` est donc un
 *     déclencheur dur, au même titre que `bootstrap/` : le coût est faible, les
 *     diffs de `config/` sont rares.
 *   · un fichier de `lang/` n'est pas non plus dans la carte — la couverture ne
 *     mesure que `app/`. Il escaladait donc au titre de « chemin non reconnu »,
 *     et c'est le repli qui coûtait le plus cher au quotidien : les dictionnaires
 *     changent souvent (TCK-476). L'arête manquante est rétablie hors de cette
 *     classe, par `Tests\Support\TranslationUsage`, injectée en `Closure` :
 *     `lang/<locale>/<domaine>.php` → ce qui cite les clés du domaine → la carte.
 *     Le repli n'est PAS remplacé, il est borné à ce qu'on sait situer.
 *
 * ⚠ CE QUI ARRIVE À LA FIN DE LA BOUCLE SANS AVOIR ÉTÉ RECONNU ESCALADE (cf. la
 * revue de branche, constat C-1 — CRITIQUE). La version précédente de cette
 * classe finissait la boucle par un `continue` : tout chemin sous
 * `takussan-api/` qui n'était NI un fichier de `tests/` de la forme `*Test.php`,
 * NI `routes/`, NI `config/`, NI `app/`, était ignoré EN SILENCE. C'était un
 * whitelist à défaut « ignorer » — la contradiction directe du principe énoncé
 * dix lignes plus haut : *« en cas de doute, escalader »*. Et c'était la MÊME
 * famille de défaut que celui trouvé sur `database/factories/` plus tôt sur
 * cette branche : une modification de `tests/ApiTestCase.php` (dont héritent
 * 38 classes de test), de
 * `tests/Concerns/InteractsWithMeilisearch.php` (21 fichiers), de
 * `.env.example` (l'environnement de test DE LA CI elle-même), ou d'un template
 * Blade, ne sélectionnait ZÉRO classe et rendait « rien à lancer », sortie 0.
 * Un `tests/` non reconnu comme classe de test escalade désormais, au lieu
 * d'être ignoré — le même traitement que `classesFor()` réserve déjà à un
 * fichier de `app/` absent de la carte. Le reste des chemins non reconnus
 * escalade aussi, sauf la liste explicite `INERT_PREFIXES` ci-dessous : un
 * whitelist à défaut « ignorer » ne se corrige pas en ajoutant des cas reconnus
 * un par un, il se corrige en inversant le défaut.
 */
final class ImpactSelector
{
    private const API_PREFIX = 'takussan-api/';

    private const TRANSLATION_PREFIX = 'lang/';

    /** Préfixes dont la modification invalide TOUTE la suite. */
    private const HARD_PREFIXES = [
        'database/migrations/',  // Modifie le schéma sous TOUS les tests.
        'database/factories/',   // Consommée par un nombre inconnu de tests ; on ne sait pas lesquels.
        'database/seeders/',     // Idem : modifie la fixture de base de tous les tests.
        'bootstrap/',
        'config/',                // cf. docblock de la classe : pas la même arête que `routes/`.
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
    ];

    /**
     * Chemins dont on est CERTAIN qu'ils n'exécutent aucun test — la seule
     * exception au « tout chemin non reconnu escalade » ci-dessus. Chacun est
     * délibéré, pas un oubli qu'on comble au fil des faux positifs :
     *   · `docs/` (de `takussan-api/`, pas la racine) — de la documentation.
     *   · `storage/` — écrit à l'exécution, jamais lu par le code applicatif.
     *   · `vendor/`, `node_modules/` — dépendances tierces, jamais modifiées
     *     par un diff de ce dépôt sans passer par `composer.lock`/`package-lock`,
     *     déjà des déclencheurs durs.
     *   · `public/build/` — sortie de build front-end, sans lien avec les tests
     *     PHP.
     * Les `*.md` sont exclus séparément, sous n'importe quel répertoire : un
     * fichier Markdown ne s'exécute jamais.
     */
    private const INERT_PREFIXES = [
        'docs/',
        'storage/',
        'vendor/',
        'node_modules/',
        'public/build/',
    ];

    /**
     * Les dictionnaires de `lang/` que le FRAMEWORK lit lui-même, hors de portée de
     * tout balayage de `app/` — ils imposent donc la suite entière, comme avant
     * TCK-476.
     *
     * ⚠ C'est la liste dont un ajout à tort ne se voit JAMAIS : elle ne fait
     * qu'escalader. C'est un oubli qui coûte — `validation.php` porte le message de
     * CHAQUE 422 du dépôt, et 13 fichiers de `app/` seulement le citent : la règle
     * du domaine applicatif y aurait sélectionné 13 consommateurs pour un
     * dictionnaire qui en a des centaines. *Sélectionner trop peu produit un faux
     * vert.*
     *
     * `scripts/check-impact-triggers.mjs` confronte cette liste à `CLAUDE.md`, au
     * même titre que les trois autres.
     */
    private const GLOBAL_TRANSLATION_DOMAINS = [
        'auth',        // `auth.failed`, `auth.throttle` — émis par le garde, pas par `app/`.
        'pagination',  // rendu par le paginateur du framework.
        'passwords',   // émis par le broker de réinitialisation.
        'validation',  // le message de chaque 422, sur 535 routes.
    ];

    /**
     * @param  \Closure(string):list<string>  $consumersOfTranslationDomain  `invitations` →
     *                                                                       les fichiers de `app/`/`tests/` qui consomment ce dictionnaire. Injecté, comme
     *                                                                       `$diffFor`, pour que cette classe continue de ne toucher NI git NI le disque.
     *                                                                       `Tests\Support\TranslationUsage::consumersOf(...)` en est l'implémentation réelle.
     */
    public function __construct(
        private readonly ImpactMap $map,
        private readonly \Closure $consumersOfTranslationDomain,
    ) {}

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
                if ($class === null) {
                    // Un fichier de `tests/` qui n'est PAS une classe `*Test.php` est du
                    // harnais — base de test, concern, mécanisme de D-44 — partagé par un
                    // nombre inconnu de classes. `classForFile()` rend `null` par
                    // conception pour ces fichiers-là (cf. son propre test) ; le traiter
                    // comme « rien » ici, au lieu d'escalader comme `classesFor()` le fait
                    // pour `app/`, est le cœur du défaut C-1 (cf. docblock de la classe).
                    return ImpactSelection::full("fichier de harnais modifié : $relative");
                }

                $selected[$class] = true;

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

            if (str_starts_with($relative, self::TRANSLATION_PREFIX)) {
                $selection = $this->selectForTranslationFile($relative, $selected);

                if ($selection !== null) {
                    return $selection;
                }

                continue;
            }

            if (str_starts_with($relative, 'app/')) {
                $classes = $this->map->classesFor($relative);

                if ($classes === null) {
                    return ImpactSelection::full("fichier absent de la carte : $relative");
                }

                foreach ($classes as $class) {
                    $selected[$class] = true;
                }

                continue;
            }

            foreach (self::INERT_PREFIXES as $prefix) {
                if (str_starts_with($relative, $prefix)) {
                    continue 2;
                }
            }

            if (str_ends_with($relative, '.md')) {
                continue;
            }

            // Tout ce qui arrive ici n'est reconnu par AUCUNE des règles ci-dessus —
            // ni harnais de test, ni route, ni `app/`, ni de la liste explicite des
            // chemins inertes. C'est exactement le cas que C-1 laissait tomber en
            // silence (cf. docblock de la classe) : `lang/`, `resources/views/`,
            // `.env.example`, un `bin/` neuf, ou tout chemin qu'on n'a pas anticipé.
            // Par construction on ne peut pas savoir ce qu'il couvre — la seule
            // réponse qui ne produit jamais de faux vert est d'escalader.
            return ImpactSelection::full("chemin non reconnu, sécurité par défaut : $relative");
        }

        return ImpactSelection::partial(array_keys($selected));
    }

    /**
     * La règle `lang/` (TCK-476). Rend `null` quand elle a nourri `$selected`, une
     * escalade sinon.
     *
     * Le repli reste le BON défaut : ce qui change, c'est sa fréquence. Un
     * dictionnaire applicatif — `invitations`, `properties`, `team` — a des
     * consommateurs qu'on sait nommer ; tout le reste escalade, y compris une forme
     * de chemin inattendue.
     *
     * @param  array<string,true>  $selected
     */
    private function selectForTranslationFile(string $relative, array &$selected): ?ImpactSelection
    {
        // `lang/<locale>/<domaine>.php`, et rien d'autre. Un `lang/en.json` (traductions
        // par chaîne), un sous-répertoire, un fichier de vendor publié : on ne sait pas
        // en dériver un domaine, donc on escalade.
        if (! preg_match('#^lang/[^/]+/([a-z0-9_-]+)\.php$#', $relative, $m)) {
            return ImpactSelection::full("fichier de langue de forme inattendue : $relative");
        }

        $domain = $m[1];

        if (in_array($domain, self::GLOBAL_TRANSLATION_DOMAINS, true)) {
            return ImpactSelection::full("dictionnaire lu par le framework : $relative");
        }

        $consumers = ($this->consumersOfTranslationDomain)($domain);

        if ($consumers === []) {
            // Un dictionnaire que personne ne cite est soit mort, soit consommé par une
            // voie qu'on ne sait pas voir. Les deux se ressemblent ici ; seule la seconde
            // coûte, et elle coûte un faux vert.
            return ImpactSelection::full("aucun consommateur résolu pour le dictionnaire $domain");
        }

        foreach ($consumers as $consumer) {
            if (str_starts_with($consumer, 'tests/')) {
                $class = ImpactMap::classForFile($consumer);

                if ($class === null) {
                    return ImpactSelection::full("consommateur de $domain dans le harnais : $consumer");
                }

                $selected[$class] = true;

                continue;
            }

            if (! str_starts_with($consumer, 'app/')) {
                // Une vue dont aucun fichier de `app/` ne cite le nom, par exemple : le
                // résolveur la rend telle quelle plutôt que de la taire.
                return ImpactSelection::full("consommateur de $domain non situable : $consumer");
            }

            $classes = $this->map->classesFor($consumer);

            if ($classes === null) {
                return ImpactSelection::full("consommateur de $domain absent de la carte : $consumer");
            }

            foreach ($classes as $class) {
                $selected[$class] = true;
            }
        }

        return null;
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
