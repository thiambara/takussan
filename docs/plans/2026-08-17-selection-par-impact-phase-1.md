# Sélection des tests par impact — plan d'implémentation (phase 1)

> **Pour un agent :** ce plan s'exécute tâche par tâche. Chaque tâche se termine par un livrable
> testable indépendamment. Les étapes sont des cases à cocher (`- [ ]`).

**Conception :** [`docs/plans/2026-08-17-temps-d-execution-des-tests.md`](2026-08-17-temps-d-execution-des-tests.md)
— **la lire avant de commencer.** Tous les chiffres cités ici y sont sourcés et datés.

**But :** qu'un agent qui modifie un fichier backend lance en ~5 s les seuls tests qui le couvrent,
au lieu des 204-235 s de la suite entière — sans jamais qu'un vert de cette commande puisse être
confondu avec un vert de la suite.

**Architecture :** PHPUnit conserve sous `--coverage-php` l'association *ligne de code → test*. Un
script réduit cette donnée à `takussan-api/tests/impact-map.json` (0,08 Mo, granularité classe). Un
second script lit `git status` / `git diff`, applique sept règles, et lance
`php artisan test <fichiers…>`. La CI régénère la carte sur push vers `dev`.

**Pile :** PHP 8.4, PHPUnit 12.5, `sebastian/code-coverage` (déjà présent via PHPUnit), Node 20 pour
la garde de dépôt, GitHub Actions.

## Contraintes globales

- **La logique vit sous `tests/Support/`, jamais sous `app/`.** `phpunit.xml` déclare
  `<source><include><directory>app</directory></include></source>` : toute classe placée dans `app/`
  entre au dénominateur du cliquet de couverture `--min=86`, dont la marge mesurée n'est que de
  **0,3 point (~74 lignes)**. Les scripts de `bin/` sont des enveloppes minces ; ils ne sont pas
  couverts et n'ont pas à l'être.
- **`Tests\` est autoloadé en dev** (`autoload-dev` PSR-4 de `takussan-api/composer.json`). Les
  scripts de `bin/` requièrent `vendor/autoload.php` et échouent explicitement si
  `Tests\Support\ImpactMap` n'existe pas (cas d'un `composer install --no-dev`).
- **Français pour les messages de commit, les commentaires et la sortie utilisateur.** Préfixe
  conventionnel, ticket cité.
- **`./vendor/bin/pint` avant chaque commit backend.** Rien ne l'impose automatiquement ; c'est une
  violation d'un seul fichier qui a bloqué la CI six semaines.
- **Ne jamais pousser ni merger sans demande explicite.**
- **Aucun chiffre écrit à la main dans un document** sans la commande qui le produit à côté.
- Chemins : la carte et le sélecteur manipulent des chemins **relatifs à `takussan-api/`** en
  interne, et **relatifs à la racine du dépôt** en entrée (c'est ce que rend `git` lancé à la
  racine). La conversion se fait en un seul endroit, `ImpactSelector::select()`.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `takussan-api/tests/Support/ImpactMap.php` | **Créer.** Construire la carte depuis les données de couverture ; la relire ; répondre « quelles classes couvrent ce fichier ». |
| `takussan-api/tests/Support/ImpactSelection.php` | **Créer.** Objet-valeur du résultat : suite entière (+ motif) ou liste de classes. |
| `takussan-api/tests/Support/ImpactSelector.php` | **Créer.** Les sept règles de décision. Aucun accès à git ni au disque : tout est injecté. |
| `takussan-api/tests/Unit/Testing/ImpactMapTest.php` | **Créer.** Tests de la carte. |
| `takussan-api/tests/Unit/Testing/ImpactSelectorTest.php` | **Créer.** Tests des règles. |
| `takussan-api/bin/build-impact-map.php` | **Créer.** Enveloppe CLI : lit le `--coverage-php`, écrit le JSON. |
| `takussan-api/bin/impacted-tests.php` | **Créer.** Enveloppe CLI : interroge git, applique le sélecteur, lance PHPUnit. |
| `takussan-api/tests/impact-map.json` | **Créer (généré).** La carte. Dérivée, jamais éditée à la main. |
| `scripts/check-impact-map.mjs` | **Créer.** Garde de dépôt : intégrité structurelle (échec) + fraîcheur (avertissement). |
| `.github/workflows/api-ci.yml` | **Modifier.** Ajouter `--coverage-php` au step existant ; nouveau step de régénération sur push vers `dev`. |
| `.github/workflows/repo-ci.yml` | **Modifier.** Brancher la nouvelle garde et ses déclencheurs. |
| `takussan-api/CLAUDE.md` | **Modifier.** Documenter la commande et ses limites. |
| `CLAUDE.md` | **Modifier.** Ajouter la commande au bloc des commandes réelles. |

---

### Task 1 : `ImpactMap` — construire et relire la carte

**Files:**
- Create: `takussan-api/tests/Support/ImpactMap.php`
- Test: `takussan-api/tests/Unit/Testing/ImpactMapTest.php`

**Interfaces:**
- Consomme : rien.
- Produit :
  - `ImpactMap::fromCoverage(array $lineCoverage, string $projectRoot, array $scannedFiles, string $commit, string $generatedAt): array`
  - `ImpactMap::fromJson(string $json): self`
  - `$map->classesFor(string $relativePath): ?array` — **`null` = fichier inconnu de la carte ; `[]` = connu mais couvert par aucun test.** Cette distinction est le cœur de la tâche 2.
  - `$map->commit(): string`, `$map->generatedAt(): string`
  - `$map->scannedByBasename(string $basename): array` — chemins `app/` dont le nom de base correspond.
  - `ImpactMap::fileForClass(string $fqcn): string` — `Tests\Feature\Api\FooTest` → `tests/Feature/Api/FooTest.php`
  - `ImpactMap::classForFile(string $relativePath): ?string` — l'inverse ; `null` si le fichier n'est pas un `*Test.php`.

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `takussan-api/tests/Unit/Testing/ImpactMapTest.php` :

```php
<?php

namespace Tests\Unit\Testing;

use PHPUnit\Framework\TestCase;
use Tests\Support\ImpactMap;

/**
 * La carte d'impact est un INDEX DÉRIVÉ, au même titre que `docs/backlog/INDEX.md` :
 * elle n'est juste que tant qu'elle suit sa source. Ces tests gardent les deux
 * propriétés dont tout le reste dépend — l'internement des noms de classe, et la
 * distinction entre « fichier inconnu » et « fichier connu que personne ne teste ».
 *
 * `PHPUnit\Framework\TestCase` et non `Tests\TestCase` : cette classe n'a besoin
 * d'aucune application Laravel, et le plancher mesuré du harnais est de 105 ms par
 * test (cf. docs/plans/2026-08-17-temps-d-execution-des-tests.md).
 */
class ImpactMapTest extends TestCase
{
    private const ROOT = '/dépôt/takussan-api';

    /** @return array<string,array<int,list<string>|null>> */
    private function lineCoverage(): array
    {
        return [
            self::ROOT.'/app/Models/Property.php' => [
                10 => ['Tests\Feature\Api\PropertyCrudTest::test_a'],
                11 => ['Tests\Feature\Api\PropertyCrudTest::test_b', 'Tests\Feature\Search\PropertySearchTest::test_c'],
                12 => [],
                13 => null,
            ],
            self::ROOT.'/app/Models/Orphan.php' => [
                4 => [],
            ],
        ];
    }

    public function test_it_interns_class_names_and_collapses_methods_to_classes(): void
    {
        $map = ImpactMap::fromCoverage($this->lineCoverage(), self::ROOT, ['app/Models/Property.php', 'app/Models/Orphan.php'], 'abc1234', '2026-08-17T00:00:00+00:00');

        $this->assertSame(1, $map['version']);
        $this->assertSame('abc1234', $map['commit']);
        $this->assertSame(
            ['Tests\Feature\Api\PropertyCrudTest', 'Tests\Feature\Search\PropertySearchTest'],
            $map['classes'],
            'les deux méthodes de PropertyCrudTest doivent se replier sur UNE entrée',
        );
        $this->assertSame([0, 1], $map['files']['app/Models/Property.php']);
    }

    public function test_a_file_covered_by_nobody_is_absent_from_files_but_present_in_scanned(): void
    {
        $map = ImpactMap::fromCoverage($this->lineCoverage(), self::ROOT, ['app/Models/Property.php', 'app/Models/Orphan.php'], 'abc1234', '2026-08-17T00:00:00+00:00');

        $this->assertArrayNotHasKey('app/Models/Orphan.php', $map['files']);
        $this->assertContains('app/Models/Orphan.php', $map['scanned']);
    }

    public function test_classes_for_distinguishes_unknown_from_uncovered(): void
    {
        $map = ImpactMap::fromJson(json_encode(ImpactMap::fromCoverage(
            $this->lineCoverage(), self::ROOT, ['app/Models/Property.php', 'app/Models/Orphan.php'], 'abc1234', '2026-08-17T00:00:00+00:00',
        )));

        $this->assertSame(
            ['Tests\Feature\Api\PropertyCrudTest', 'Tests\Feature\Search\PropertySearchTest'],
            $map->classesFor('app/Models/Property.php'),
        );
        $this->assertSame([], $map->classesFor('app/Models/Orphan.php'), 'connu, mais aucun test ne le couvre → rien à lancer');
        $this->assertNull($map->classesFor('app/Models/TouteNeuve.php'), 'inconnu → l\'appelant doit escalader');
    }

    public function test_it_refuses_a_map_of_another_version(): void
    {
        $this->expectException(\RuntimeException::class);
        ImpactMap::fromJson('{"version":99,"commit":"a","generated_at":"b","classes":[],"scanned":[],"files":{}}');
    }

    public function test_it_converts_between_class_and_file(): void
    {
        $this->assertSame('tests/Feature/Api/PropertyCrudTest.php', ImpactMap::fileForClass('Tests\Feature\Api\PropertyCrudTest'));
        $this->assertSame('Tests\Feature\Api\PropertyCrudTest', ImpactMap::classForFile('tests/Feature/Api/PropertyCrudTest.php'));
        $this->assertNull(ImpactMap::classForFile('tests/Support/ImpactMap.php'), 'ce n\'est pas une classe de test');
    }

    public function test_it_finds_scanned_files_by_basename(): void
    {
        $map = ImpactMap::fromJson(json_encode(ImpactMap::fromCoverage(
            $this->lineCoverage(), self::ROOT, ['app/Models/Property.php', 'app/Http/Controllers/PropertyController.php'], 'abc1234', '2026-08-17T00:00:00+00:00',
        )));

        $this->assertSame(['app/Http/Controllers/PropertyController.php'], $map->scannedByBasename('PropertyController'));
        $this->assertSame([], $map->scannedByBasename('Inexistant'));
    }
}
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

```bash
cd takussan-api && php artisan test tests/Unit/Testing/ImpactMapTest.php
```

Attendu : ÉCHEC avec `Class "Tests\Support\ImpactMap" not found`.

- [ ] **Step 3 : écrire l'implémentation**

Créer `takussan-api/tests/Support/ImpactMap.php` :

```php
<?php

namespace Tests\Support;

use RuntimeException;

/**
 * La carte d'impact : quelles classes de test exécutent quel fichier de `app/`.
 *
 * Elle est DÉRIVÉE de la donnée que PHPUnit produit sous `--coverage-php`, et n'est
 * jamais écrite à la main — même règle que `docs/backlog/INDEX.md`, et pour la même
 * raison : aucune liste maintenue à la main ne reste juste.
 *
 * DEUX choix de forme portent tout le reste, et ils sont mesurés
 * (cf. `docs/plans/2026-08-17-temps-d-execution-des-tests.md`) :
 *
 * 1. **Granularité CLASSE, pas méthode.** Le plancher du harnais est de 3,2 s
 *    d'amorçage + 105 ms par test : lancer une classe entière plutôt qu'une méthode
 *    coûte quelques dixièmes de seconde et divise la taille de la carte par ~7.
 *    Sur-inclusif, donc du bon côté.
 * 2. **`scanned` liste TOUS les fichiers du périmètre, `files` seulement les
 *    couverts.** 129 des 796 fichiers de `app/` ne sont couverts par aucun test.
 *    Sans cette distinction, ils seraient traités comme « inconnus » et
 *    escaladeraient à tort sur la suite entière — mesuré : 36 commits sur 172.
 */
final class ImpactMap
{
    public const VERSION = 1;

    private const TEST_NAMESPACE = 'Tests\\';

    /** @var array<string,list<string>>|null Index paresseux nom de base → chemins scannés. */
    private ?array $basenameIndex = null;

    /**
     * @param  list<string>  $classes
     * @param  array<string,true>  $scanned
     * @param  array<string,list<int>>  $files
     */
    private function __construct(
        private readonly string $commit,
        private readonly string $generatedAt,
        private readonly array $classes,
        private readonly array $scanned,
        private readonly array $files,
    ) {}

    /**
     * Réduit la donnée de `SebastianBergmann\CodeCoverage\Data\ProcessedCodeCoverageData::lineCoverage()`.
     *
     * @param  array<string,array<int,list<string>|null>>  $lineCoverage  chemins ABSOLUS
     * @param  list<string>  $scannedFiles  chemins relatifs à `$projectRoot`
     * @return array<string,mixed>  prêt pour `json_encode`
     */
    public static function fromCoverage(
        array $lineCoverage,
        string $projectRoot,
        array $scannedFiles,
        string $commit,
        string $generatedAt,
    ): array {
        $prefix = rtrim($projectRoot, '/').'/';
        $classIndex = [];
        $classes = [];
        $files = [];

        foreach ($lineCoverage as $absolute => $lines) {
            $relative = str_starts_with($absolute, $prefix) ? substr($absolute, strlen($prefix)) : $absolute;

            $seen = [];
            foreach ($lines as $tests) {
                foreach ($tests ?? [] as $testId) {
                    $seen[explode('::', $testId)[0]] = true;
                }
            }

            if ($seen === []) {
                continue;
            }

            $ids = [];
            foreach (array_keys($seen) as $class) {
                if (! isset($classIndex[$class])) {
                    $classIndex[$class] = count($classes);
                    $classes[] = $class;
                }
                $ids[] = $classIndex[$class];
            }
            sort($ids);
            $files[$relative] = $ids;
        }

        ksort($files);
        $scanned = array_values(array_unique($scannedFiles));
        sort($scanned);

        return [
            'version' => self::VERSION,
            'commit' => $commit,
            'generated_at' => $generatedAt,
            'classes' => $classes,
            'scanned' => $scanned,
            'files' => $files,
        ];
    }

    public static function fromJson(string $json): self
    {
        $data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);

        if (! is_array($data) || ($data['version'] ?? null) !== self::VERSION) {
            throw new RuntimeException(sprintf(
                'impact-map.json : version %s inattendue (attendu %d). Régénérer la carte.',
                json_encode($data['version'] ?? null),
                self::VERSION,
            ));
        }

        return new self(
            (string) $data['commit'],
            (string) $data['generated_at'],
            $data['classes'],
            array_fill_keys($data['scanned'], true),
            $data['files'],
        );
    }

    public function commit(): string
    {
        return $this->commit;
    }

    public function generatedAt(): string
    {
        return $this->generatedAt;
    }

    /**
     * @return list<string>|null  `null` = fichier INCONNU de la carte (l'appelant doit
     *                            escalader sur la suite entière) ; `[]` = fichier connu
     *                            que AUCUN test ne couvre (rien à lancer).
     */
    public function classesFor(string $relativePath): ?array
    {
        if (isset($this->files[$relativePath])) {
            return array_map(fn (int $i) => $this->classes[$i], $this->files[$relativePath]);
        }

        return isset($this->scanned[$relativePath]) ? [] : null;
    }

    /** @return list<string> */
    public function scannedByBasename(string $basename): array
    {
        if ($this->basenameIndex === null) {
            $this->basenameIndex = [];
            foreach (array_keys($this->scanned) as $path) {
                $this->basenameIndex[basename($path, '.php')][] = $path;
            }
        }

        return $this->basenameIndex[$basename] ?? [];
    }

    /** `Tests\Feature\Api\FooTest` → `tests/Feature/Api/FooTest.php` (PSR-4 `Tests\` → `tests/`). */
    public static function fileForClass(string $fqcn): string
    {
        return 'tests/'.str_replace('\\', '/', substr($fqcn, strlen(self::TEST_NAMESPACE))).'.php';
    }

    /** L'inverse. `null` si le fichier n'est pas une classe de test. */
    public static function classForFile(string $relativePath): ?string
    {
        if (! str_starts_with($relativePath, 'tests/') || ! str_ends_with($relativePath, 'Test.php')) {
            return null;
        }

        return self::TEST_NAMESPACE.str_replace('/', '\\', substr($relativePath, strlen('tests/'), -strlen('.php')));
    }
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

```bash
cd takussan-api && php artisan test tests/Unit/Testing/ImpactMapTest.php
```

Attendu : `Tests: 6 passed`.

- [ ] **Step 5 : Pint, puis commit**

```bash
cd takussan-api && ./vendor/bin/pint tests/Support/ImpactMap.php tests/Unit/Testing/ImpactMapTest.php
cd .. && git add takussan-api/tests/Support/ImpactMap.php takussan-api/tests/Unit/Testing/ImpactMapTest.php
git commit -m "feat(tests): la carte d'impact — construction, relecture, et la distinction inconnu/non-couvert (TCK-320)"
```

---

### Task 2 : `ImpactSelection` et `ImpactSelector` — les sept règles

**Files:**
- Create: `takussan-api/tests/Support/ImpactSelection.php`
- Create: `takussan-api/tests/Support/ImpactSelector.php`
- Test: `takussan-api/tests/Unit/Testing/ImpactSelectorTest.php`

**Interfaces:**
- Consomme : `ImpactMap::fromJson()`, `$map->classesFor()`, `$map->scannedByBasename()`,
  `ImpactMap::classForFile()`, `ImpactMap::fileForClass()` (tâche 1).
- Produit :
  - `new ImpactSelector(ImpactMap $map)`
  - `$selector->select(array $changedPaths, callable $diffFor, array $testClassesSinceMapCommit): ImpactSelection`
    — `$changedPaths` : chemins relatifs à la **racine du dépôt** ; `$diffFor` : `fn(string $path): string`
    rendant le diff unifié du fichier ; `$testClassesSinceMapCommit` : noms COMPLETS de classes.
  - `ImpactSelection::full(string $reason)`, `ImpactSelection::partial(array $classes)`
  - `$selection->fullSuite` (bool), `$selection->reason` (?string), `$selection->classes` (list<string>),
    `$selection->testFiles(): list<string>`

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `takussan-api/tests/Unit/Testing/ImpactSelectorTest.php` :

```php
<?php

namespace Tests\Unit\Testing;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Support\ImpactMap;
use Tests\Support\ImpactSelector;

/**
 * Les sept règles de sélection. Cinq d'entre elles existent pour ESCALADER, pas
 * pour sélectionner : un sélecteur qui se trompe en sélectionnant trop coûte du
 * temps, un sélecteur qui se trompe en sélectionnant trop peu produit un FAUX VERT.
 * Les tests ci-dessous sont écrits dans ce sens-là.
 */
class ImpactSelectorTest extends TestCase
{
    private function selector(): ImpactSelector
    {
        return new ImpactSelector(ImpactMap::fromJson(json_encode([
            'version' => 1,
            'commit' => 'abc1234',
            'generated_at' => '2026-08-17T00:00:00+00:00',
            'classes' => [
                'Tests\Feature\Api\PropertyCrudTest',
                'Tests\Feature\Search\PropertySearchTest',
                'Tests\Unit\PriceTest',
            ],
            'scanned' => [
                'app/Models/Property.php',
                'app/Models/Orphan.php',
                'app/Http/Controllers/PropertyController.php',
                'app/Support/Price.php',
            ],
            'files' => [
                'app/Models/Property.php' => [0, 1],
                'app/Http/Controllers/PropertyController.php' => [0],
                'app/Support/Price.php' => [2],
            ],
        ])));
    }

    private function noDiff(): callable
    {
        return fn (string $path): string => '';
    }

    public function test_a_covered_app_file_selects_its_classes(): void
    {
        $s = $this->selector()->select(['takussan-api/app/Support/Price.php'], $this->noDiff(), []);

        $this->assertFalse($s->fullSuite);
        $this->assertSame(['Tests\Unit\PriceTest'], $s->classes);
        $this->assertSame(['tests/Unit/PriceTest.php'], $s->testFiles());
    }

    public function test_a_scanned_but_uncovered_app_file_selects_nothing(): void
    {
        $s = $this->selector()->select(['takussan-api/app/Models/Orphan.php'], $this->noDiff(), []);

        $this->assertFalse($s->fullSuite, 'aucun test ne le couvre : la suite entière n\'en testerait pas davantage');
        $this->assertSame([], $s->classes);
    }

    public function test_an_app_file_absent_from_the_map_escalates(): void
    {
        $s = $this->selector()->select(['takussan-api/app/Models/ToutNeuf.php'], $this->noDiff(), []);

        $this->assertTrue($s->fullSuite);
        $this->assertStringContainsString('absent de la carte', (string) $s->reason);
    }

    /**
     * @return list<array{0:string}>
     */
    public static function declencheursDurs(): array
    {
        return [
            ['takussan-api/database/migrations/2026_01_01_000000_create_x_table.php'],
            ['takussan-api/bootstrap/app.php'],
            ['takussan-api/composer.lock'],
            ['takussan-api/composer.json'],
            ['takussan-api/phpunit.xml'],
            ['takussan-api/tests/bootstrap.php'],
            ['takussan-api/tests/TestCase.php'],
        ];
    }

    // PHPUnit 12 : l'ATTRIBUT, pas l'annotation `@dataProvider` — dépréciée depuis
    // PHPUnit 10 et supprimée en 12, où elle ne serait tout simplement pas lue.
    #[DataProvider('declencheursDurs')]
    public function test_global_files_escalate(string $path): void
    {
        $s = $this->selector()->select([$path], $this->noDiff(), []);

        $this->assertTrue($s->fullSuite, "$path devrait imposer la suite entière");
    }

    public function test_a_modified_test_file_selects_itself(): void
    {
        $s = $this->selector()->select(['takussan-api/tests/Feature/Api/AgencyTest.php'], $this->noDiff(), []);

        $this->assertFalse($s->fullSuite);
        $this->assertSame(['Tests\Feature\Api\AgencyTest'], $s->classes);
    }

    public function test_a_route_file_resolves_controllers_named_in_the_diff(): void
    {
        $diff = fn (string $path): string => "+    Route::get('/x', [PropertyController::class, 'index']);\n";

        $s = $this->selector()->select(['takussan-api/routes/api.php'], $diff, []);

        $this->assertFalse($s->fullSuite);
        $this->assertSame(['Tests\Feature\Api\PropertyCrudTest'], $s->classes);
    }

    public function test_a_route_file_with_no_resolvable_class_escalates(): void
    {
        $diff = fn (string $path): string => "+    Route::get('/x', fn () => 'ok');\n";

        $s = $this->selector()->select(['takussan-api/routes/api.php'], $diff, []);

        $this->assertTrue($s->fullSuite);
        $this->assertStringContainsString('routes/api.php', (string) $s->reason);
    }

    public function test_files_outside_the_api_are_ignored(): void
    {
        $s = $this->selector()->select([
            'docs/ardoise.md',
            'takussan-web/src/app/page.tsx',
            'README.md',
        ], $this->noDiff(), []);

        $this->assertFalse($s->fullSuite);
        $this->assertSame([], $s->classes);
    }

    public function test_staleness_repair_adds_test_classes_written_since_the_map(): void
    {
        $s = $this->selector()->select(
            ['takussan-api/app/Support/Price.php'],
            $this->noDiff(),
            ['Tests\Feature\Neuf\ToutNouveauTest'],
        );

        $this->assertFalse($s->fullSuite);
        $this->assertSame(
            ['Tests\Feature\Neuf\ToutNouveauTest', 'Tests\Unit\PriceTest'],
            $s->classes,
            'une classe de test écrite APRÈS la carte ne peut pas y figurer : elle est ajoutée d\'office',
        );
    }

    public function test_one_escalating_file_wins_over_every_selection(): void
    {
        $s = $this->selector()->select([
            'takussan-api/app/Support/Price.php',
            'takussan-api/database/migrations/2026_01_01_000000_create_x_table.php',
        ], $this->noDiff(), []);

        $this->assertTrue($s->fullSuite, 'un seul déclencheur dur suffit — la sélection ne se négocie pas');
    }
}
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

```bash
cd takussan-api && php artisan test tests/Unit/Testing/ImpactSelectorTest.php
```

Attendu : ÉCHEC avec `Class "Tests\Support\ImpactSelector" not found`.

- [ ] **Step 3 : écrire `ImpactSelection`**

Créer `takussan-api/tests/Support/ImpactSelection.php` :

```php
<?php

namespace Tests\Support;

/**
 * Le résultat d'une sélection : soit la suite entière AVEC SON MOTIF, soit une
 * liste de classes.
 *
 * Le motif n'est pas décoratif. Une escalade silencieuse est une escalade qu'on
 * ne peut pas mettre en doute — et donc une escalade qu'on n'améliorera jamais.
 */
final class ImpactSelection
{
    /** @param  list<string>  $classes */
    private function __construct(
        public readonly bool $fullSuite,
        public readonly ?string $reason,
        public readonly array $classes,
    ) {}

    public static function full(string $reason): self
    {
        return new self(true, $reason, []);
    }

    /** @param  list<string>  $classes */
    public static function partial(array $classes): self
    {
        sort($classes);

        return new self(false, null, array_values($classes));
    }

    /** @return list<string> chemins de fichiers de test, relatifs à `takussan-api/` */
    public function testFiles(): array
    {
        return array_map(ImpactMap::fileForClass(...), $this->classes);
    }
}
```

- [ ] **Step 4 : écrire `ImpactSelector`**

Créer `takussan-api/tests/Support/ImpactSelector.php` :

```php
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
        'database/migrations/',
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
```

- [ ] **Step 5 : lancer les tests pour vérifier qu'ils passent**

```bash
cd takussan-api && php artisan test tests/Unit/Testing/ImpactSelectorTest.php
```

Attendu : `Tests: 16 passed` (9 méthodes + 7 cas du `dataProvider`).

- [ ] **Step 6 : Pint, puis commit**

```bash
cd takussan-api && ./vendor/bin/pint tests/Support/ tests/Unit/Testing/
cd .. && git add takussan-api/tests/Support/ImpactSelection.php takussan-api/tests/Support/ImpactSelector.php takussan-api/tests/Unit/Testing/ImpactSelectorTest.php
git commit -m "feat(tests): les sept règles de sélection par impact, dont cinq escaladent (TCK-320)"
```

---

### Task 3 : `bin/build-impact-map.php` — l'enveloppe de génération

**Files:**
- Create: `takussan-api/bin/build-impact-map.php`

**Interfaces:**
- Consomme : `ImpactMap::fromCoverage()` (tâche 1).
- Produit : `takussan-api/tests/impact-map.json`.

- [ ] **Step 1 : écrire le script**

Créer `takussan-api/bin/build-impact-map.php` :

```php
#!/usr/bin/env php
<?php

/**
 * Réduit un rapport `--coverage-php` de PHPUnit en carte d'impact.
 *
 * Usage :
 *   php bin/build-impact-map.php storage/coverage/cov.php [tests/impact-map.json]
 *
 * ⚠ CE SCRIPT NE VIT PAS SOUS `app/`, ET C'EST DÉLIBÉRÉ. `phpunit.xml` déclare
 * `<source><include><directory>app</directory></include></source>` : une commande
 * artisan placée là entrerait au dénominateur du cliquet `--min=86`, dont la marge
 * mesurée n'est que de 0,3 point (~74 lignes). Un outil de développement n'a pas à
 * dépenser la marge de couverture de l'application — ni à être livré en production.
 *
 * La LOGIQUE est dans `Tests\Support\ImpactMap`, qui est testée. Ce fichier est une
 * enveloppe mince : lecture d'arguments, parcours de `app/`, écriture.
 */

require __DIR__.'/../vendor/autoload.php';

if (! class_exists(Tests\Support\ImpactMap::class)) {
    fwrite(STDERR, "✗ Tests\\Support\\ImpactMap est introuvable.\n".
        "  L'espace de noms `Tests\\` vit dans `autoload-dev` : ce script ne fonctionne pas\n".
        "  après un `composer install --no-dev`.\n");
    exit(1);
}

$coveragePath = $argv[1] ?? null;
$outputPath = $argv[2] ?? __DIR__.'/../tests/impact-map.json';

if ($coveragePath === null || ! is_file($coveragePath)) {
    fwrite(STDERR, "usage : php bin/build-impact-map.php <rapport --coverage-php> [sortie.json]\n");
    exit(1);
}

$root = realpath(__DIR__.'/..');
$coverage = include $coveragePath;

if (! $coverage instanceof SebastianBergmann\CodeCoverage\CodeCoverage) {
    fwrite(STDERR, "✗ $coveragePath n'est pas un rapport `--coverage-php` de PHPUnit.\n");
    exit(1);
}

// Le périmètre SCANNÉ, et non le périmètre couvert : c'est cette liste qui permet
// de distinguer « fichier que personne ne teste » (rien à lancer) de « fichier
// inconnu de la carte » (suite entière). Sans elle, 36 commits sur 172 escaladaient
// à tort — mesuré le 2026-08-17.
$scanned = [];
$iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root.'/app', FilesystemIterator::SKIP_DOTS));
foreach ($iterator as $file) {
    if ($file->isFile() && $file->getExtension() === 'php') {
        $scanned[] = substr($file->getPathname(), strlen($root) + 1);
    }
}

$commit = trim((string) shell_exec('git -C '.escapeshellarg($root).' rev-parse HEAD 2>/dev/null'));

if ($commit === '') {
    fwrite(STDERR, "✗ impossible de lire le commit courant (`git rev-parse HEAD`).\n".
        "  La carte porte le commit qui l'a engendrée : c'est ce qui permet de rattraper\n".
        "  sa péremption. Sans lui, elle serait un faux vert en puissance.\n");
    exit(1);
}

$map = Tests\Support\ImpactMap::fromCoverage(
    $coverage->getData()->lineCoverage(),
    $root,
    $scanned,
    $commit,
    gmdate('c'),
);

file_put_contents($outputPath, json_encode($map, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n");

printf(
    "carte écrite : %s\n  %d classes de test · %d fichiers couverts sur %d scannés · %.2f Mo\n",
    $outputPath,
    count($map['classes']),
    count($map['files']),
    count($map['scanned']),
    filesize($outputPath) / 1048576,
);
```

- [ ] **Step 2 : produire un rapport de couverture réduit et lancer le script**

```bash
cd takussan-api
XDEBUG_MODE=coverage php artisan test tests/Feature/Api/PropertyCrudTest.php --coverage-php=/tmp/cov-probe.php
php bin/build-impact-map.php /tmp/cov-probe.php /tmp/impact-probe.json
```

Attendu : une ligne `carte écrite : /tmp/impact-probe.json` avec **1 classe de test**,
un nombre de fichiers couverts de l'ordre de 150-250, et **796 fichiers scannés**
(le compte exact se prend avec `find app -name '*.php' | wc -l`).

- [ ] **Step 3 : vérifier que la carte se relit**

```bash
cd takussan-api && php -r '
require "vendor/autoload.php";
$m = Tests\Support\ImpactMap::fromJson(file_get_contents("/tmp/impact-probe.json"));
var_dump($m->classesFor("app/Models/Property.php"));
var_dump($m->classesFor("app/Models/CeFichierNExistePas.php"));
'
```

Attendu : le premier appel rend un tableau contenant `Tests\Feature\Api\PropertyCrudTest`,
le second rend `NULL`.

- [ ] **Step 4 : commit**

```bash
git add takussan-api/bin/build-impact-map.php
git commit -m "feat(tests): l'enveloppe qui réduit un rapport --coverage-php en carte d'impact (TCK-320)"
```

---

### Task 4 : `bin/impacted-tests.php` — l'enveloppe de sélection

**Files:**
- Create: `takussan-api/bin/impacted-tests.php`

**Interfaces:**
- Consomme : `ImpactMap::fromJson()`, `ImpactSelector::select()`, `ImpactSelection` (tâches 1 et 2).
- Produit : la commande que l'agent lance au quotidien.

- [ ] **Step 1 : écrire le script**

Créer `takussan-api/bin/impacted-tests.php` :

```php
#!/usr/bin/env php
<?php

/**
 * Lance les seuls tests que le diff courant touche.
 *
 * Usage :
 *   php bin/impacted-tests.php              # ce que dit `git status` (l'agent qui itère)
 *   php bin/impacted-tests.php --base=dev   # + tout ce qui sépare HEAD de `dev`
 *   php bin/impacted-tests.php --run        # exécute au lieu d'afficher la commande
 *
 * ⚠ UN VERT DE CETTE COMMANDE NE DIT RIEN DE LA SUITE. C'est une boucle de retour
 * rapide pendant le développement, pas une garde. La CI et le rituel de fin de
 * branche continuent de jouer les ~2400 tests. Une carte périmée coûte alors une
 * découverte tardive — jamais une régression mergée.
 */

require __DIR__.'/../vendor/autoload.php';

use Tests\Support\ImpactMap;
use Tests\Support\ImpactSelector;

if (! class_exists(ImpactMap::class)) {
    fwrite(STDERR, "✗ Tests\\Support\\ImpactMap est introuvable (`composer install --no-dev` ?).\n");
    exit(1);
}

$api = realpath(__DIR__.'/..');
$root = realpath($api.'/..');
$mapPath = $api.'/tests/impact-map.json';

$base = null;
$run = false;
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--run') {
        $run = true;
    } elseif (str_starts_with($arg, '--base=')) {
        $base = substr($arg, strlen('--base='));
    } else {
        fwrite(STDERR, "argument inconnu : $arg\n");
        exit(1);
    }
}

$git = function (string $args) use ($root): array {
    exec('git -C '.escapeshellarg($root).' '.$args.' 2>/dev/null', $out, $code);

    return [$out, $code];
};

// ── La carte ────────────────────────────────────────────────────────────────
if (! is_file($mapPath)) {
    fwrite(STDERR, "✗ carte absente : tests/impact-map.json\n".
        "  Elle est engendrée par la CI sur push vers `dev`. En attendant, lancer la suite\n".
        "  entière : php artisan test\n");
    exit(1);
}

$map = ImpactMap::fromJson(file_get_contents($mapPath));

// ── Les fichiers modifiés ───────────────────────────────────────────────────
// `git status --porcelain` couvre l'arbre de travail ET les fichiers non suivis —
// c'est exactement le cas de l'agent qui itère, et le seul qui compte au quotidien.
[$statusLines] = $git('status --porcelain');
$changed = [];
foreach ($statusLines as $line) {
    $path = trim(substr($line, 3));
    // Un renommage s'écrit `R  ancien -> nouveau` : les DEUX côtés comptent.
    foreach (explode(' -> ', $path) as $part) {
        $changed[trim($part, '"')] = true;
    }
}

if ($base !== null) {
    [$diffLines, $code] = $git('diff --name-only '.escapeshellarg($base).'...HEAD');
    if ($code !== 0) {
        fwrite(STDERR, "✗ `git diff $base...HEAD` a échoué. Référence inconnue ?\n");
        exit(1);
    }
    foreach ($diffLines as $path) {
        $changed[$path] = true;
    }
}

// ── La réparation de péremption ─────────────────────────────────────────────
// Une carte vieille de deux semaines ne connaît pas les tests écrits depuis. Les
// ajouter d'office referme le trou « un test neuf couvre mon fichier » pour un coût
// nul. Si le commit de la carte est introuvable (clone superficiel), on ESCALADE :
// une réparation qu'on ne peut pas faire ne se présume pas faite.
[$sinceLines, $sinceCode] = $git('diff --name-only '.escapeshellarg($map->commit()).'..HEAD -- takussan-api/tests');
$stalenessKnown = $sinceCode === 0;
$testClassesSince = [];
foreach ($sinceLines as $path) {
    if (str_starts_with($path, 'takussan-api/')) {
        $class = ImpactMap::classForFile(substr($path, strlen('takussan-api/')));
        if ($class !== null) {
            $testClassesSince[] = $class;
        }
    }
}

[$ahead] = $git('rev-list --count '.escapeshellarg($map->commit()).'..HEAD');
$age = (int) round((time() - strtotime($map->generatedAt())) / 86400);

printf(
    "carte : %s · engendrée il y a %d jour(s) · %s commit(s) en arrière\n",
    substr($map->commit(), 0, 8),
    $age,
    $stalenessKnown ? ($ahead[0] ?? '?') : 'historique incomplet',
);

// ── La décision ─────────────────────────────────────────────────────────────
$diffFor = function (string $path) use ($git): string {
    [$lines] = $git('diff --unified=0 -- '.escapeshellarg($path));

    return implode("\n", $lines);
};

if (! $stalenessKnown) {
    fwrite(STDERR, "⚠ le commit de la carte est introuvable dans l'historique (clone superficiel ?).\n".
        "  La réparation de péremption est impossible → suite entière.\n");
    $command = 'php artisan test';
} else {
    $selection = (new ImpactSelector($map))->select(array_keys($changed), $diffFor, $testClassesSince);

    if ($selection->fullSuite) {
        printf("règle : SUITE ENTIÈRE — %s\n", $selection->reason);
        $command = 'php artisan test';
    } elseif ($selection->classes === []) {
        print("règle : rien à lancer — aucun fichier modifié n'est couvert par un test.\n");
        exit(0);
    } else {
        printf("règle : sélection partielle — %d classe(s)\n", count($selection->classes));
        foreach ($selection->testFiles() as $file) {
            printf("  %s\n", $file);
        }
        $command = 'php artisan test '.implode(' ', array_map('escapeshellarg', $selection->testFiles()));
    }
}

if (! $run) {
    printf("\ncommande :\n  %s\n", $command);
    exit(0);
}

chdir($api);
passthru($command, $code);
exit($code);
```

- [ ] **Step 2 : éprouver le script sur un vrai diff**

```bash
cd takussan-api
# Fabriquer une carte de travail depuis la sonde de la tâche 3 :
php bin/build-impact-map.php /tmp/cov-probe.php tests/impact-map.json
# Toucher un fichier couvert, puis demander la sélection :
touch app/Models/Property.php
php bin/impacted-tests.php
```

Attendu : trois lignes — `carte : …`, `règle : sélection partielle — 1 classe(s)`,
`tests/Feature/Api/PropertyCrudTest.php`, puis la commande.

```bash
git checkout -- app/Models/Property.php
touch database/migrations/*create_users_table*.php
php bin/impacted-tests.php
```

Attendu : `règle : SUITE ENTIÈRE — fichier global modifié : database/migrations/…`.

```bash
git checkout -- database/migrations/ && rm tests/impact-map.json
```

- [ ] **Step 3 : commit**

```bash
git add takussan-api/bin/impacted-tests.php
git commit -m "feat(tests): la commande qui ne lance que les tests touchés par le diff (TCK-320)"
```

---

### Task 5 : la garde de dépôt

**Files:**
- Create: `scripts/check-impact-map.mjs`
- Modify: `.github/workflows/repo-ci.yml`

**Interfaces:**
- Consomme : `takussan-api/tests/impact-map.json`.
- Produit : `node scripts/check-impact-map.mjs` — sortie 1 sur défaut structurel, 0 avec
  avertissement sur péremption.

- [ ] **Step 1 : écrire la garde**

Créer `scripts/check-impact-map.mjs` :

```javascript
#!/usr/bin/env node
/**
 * Garde de la CARTE D'IMPACT.
 *
 * `takussan-api/tests/impact-map.json` dit quelles classes de test couvrent quel
 * fichier de `app/`. Elle est DÉRIVÉE d'un rapport `--coverage-php` de PHPUnit, et
 * elle est le seul document de ce dépôt dont la péremption produit un FAUX VERT :
 * un fichier dont les tests ont changé depuis la génération se verrait attribuer
 * les anciens.
 *
 * Cette garde sépare deux choses qui ne se paient pas au même prix :
 *
 *   · L'INTÉGRITÉ STRUCTURELLE est un ÉCHEC. Un index hors bornes, une clé de
 *     `files` absente de `scanned`, une version inattendue : la carte ment, et le
 *     sélecteur qui la lit prendrait ses décisions sur du sable.
 *   · La PÉREMPTION est un AVERTISSEMENT. Une carte de trois semaines est moins
 *     bonne qu'une carte d'hier, mais elle n'est pas fausse : `impacted-tests.php`
 *     rattrape les tests écrits depuis, et la suite entière reste la seule garde.
 *     Faire échouer la CI là-dessus, ce serait bloquer des PR sur la fraîcheur d'un
 *     index qu'aucune PR ne contrôle.
 *
 * Usage :
 *   node scripts/check-impact-map.mjs
 *   node scripts/check-impact-map.mjs --report
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const CHEMIN = join(ROOT, 'takussan-api', 'tests', 'impact-map.json');
const AGE_MAX_JOURS = 30;
const VERSION_ATTENDUE = 1;

const erreurs = [];
const avertissements = [];

if (!existsSync(CHEMIN)) {
  console.error(
    `✗ carte d'impact absente : takussan-api/tests/impact-map.json\n` +
      `  Elle est engendrée par le job « carte d'impact » d'api-ci.yml sur push vers dev.\n` +
      `  Localement : XDEBUG_MODE=coverage php artisan test --coverage-php=/tmp/cov.php\n` +
      `               php bin/build-impact-map.php /tmp/cov.php`,
  );
  process.exit(1);
}

let carte;
try {
  carte = JSON.parse(readFileSync(CHEMIN, 'utf8'));
} catch (e) {
  console.error(`✗ carte d'impact illisible : ${e.message}`);
  process.exit(1);
}

if (carte.version !== VERSION_ATTENDUE) {
  erreurs.push(`version ${JSON.stringify(carte.version)} inattendue (attendu ${VERSION_ATTENDUE})`);
}

for (const clef of ['commit', 'generated_at', 'classes', 'scanned', 'files']) {
  if (carte[clef] === undefined) erreurs.push(`clé « ${clef} » absente`);
}

if (erreurs.length === 0) {
  if (carte.classes.length === 0) erreurs.push('aucune classe de test — la carte est vide');
  if (carte.scanned.length === 0) erreurs.push('aucun fichier scanné — la carte est vide');

  const scannes = new Set(carte.scanned);
  for (const [fichier, indices] of Object.entries(carte.files)) {
    if (!scannes.has(fichier)) {
      erreurs.push(`« ${fichier} » est dans files mais absent de scanned`);
    }
    for (const i of indices) {
      if (!Number.isInteger(i) || i < 0 || i >= carte.classes.length) {
        erreurs.push(`« ${fichier} » référence l'indice de classe ${i}, hors bornes (0..${carte.classes.length - 1})`);
      }
    }
  }
}

// Péremption — avertissement, jamais échec.
const ageJours = Math.round((Date.now() - Date.parse(carte.generated_at)) / 86400000);
if (Number.isNaN(ageJours)) {
  erreurs.push(`generated_at illisible : ${JSON.stringify(carte.generated_at)}`);
} else if (ageJours > AGE_MAX_JOURS) {
  avertissements.push(`carte engendrée il y a ${ageJours} jours (plafond indicatif : ${AGE_MAX_JOURS})`);
}

// Le commit — avertissement aussi : `actions/checkout` clone à une profondeur de 1
// par défaut, donc son absence ne prouve rien.
try {
  execFileSync('git', ['-C', ROOT, 'cat-file', '-e', `${carte.commit}^{commit}`], { stdio: 'ignore' });
} catch {
  avertissements.push(`commit ${String(carte.commit).slice(0, 8)} introuvable dans l'historique local (clone superficiel ?)`);
}

if (REPORT) {
  console.log(`carte : ${String(carte.commit).slice(0, 8)} · ${carte.generated_at} · ${ageJours} jour(s)`);
  console.log(`  ${carte.classes.length} classes · ${Object.keys(carte.files).length} fichiers couverts sur ${carte.scanned.length} scannés`);
}

for (const a of avertissements) console.warn(`⚠ carte d'impact : ${a}`);

if (erreurs.length > 0) {
  console.error(`✗ carte d'impact — ${erreurs.length} défaut(s) structurel(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}

console.log('✓ carte d\'impact : structure cohérente');
```

- [ ] **Step 2 : vérifier que la garde échoue en l'absence de carte**

```bash
cd /Users/aminethiam/Documents/perso/takussan && node scripts/check-impact-map.mjs; echo "sortie=$?"
```

Attendu : `✗ carte d'impact absente` et `sortie=1`.

- [ ] **Step 3 : vérifier qu'elle passe sur une carte valide**

```bash
cd takussan-api && php bin/build-impact-map.php /tmp/cov-probe.php tests/impact-map.json
cd .. && node scripts/check-impact-map.mjs --report; echo "sortie=$?"
```

Attendu : `✓ carte d'impact : structure cohérente` et `sortie=0`.

- [ ] **Step 4 : vérifier qu'elle attrape un index hors bornes**

```bash
cd /Users/aminethiam/Documents/perso/takussan
php -r '$f="takussan-api/tests/impact-map.json"; $m=json_decode(file_get_contents($f),true); $k=array_key_first($m["files"]); $m["files"][$k][]=99999; file_put_contents("/tmp/carte-cassee.json", json_encode($m));'
cp /tmp/carte-cassee.json takussan-api/tests/impact-map.json
node scripts/check-impact-map.mjs; echo "sortie=$?"
```

Attendu : `hors bornes` et `sortie=1`. *C'est l'ablation : sans elle, on n'aurait aucune preuve que
la garde garde quoi que ce soit.*

Puis restaurer :

```bash
cd takussan-api && php bin/build-impact-map.php /tmp/cov-probe.php tests/impact-map.json && cd ..
```

- [ ] **Step 5 : brancher la garde dans Repo CI**

Dans `.github/workflows/repo-ci.yml`, ajouter à la liste `paths` du déclencheur, en respectant le
commentaire qui l'ouvre (*« la garde les lit, le déclencheur doit les couvrir »*) :

```yaml
      # `check-impact-map` lit la carte. Aucune entrée existante ne la couvre : les
      # déclencheurs de ce workflow visent `takussan-api/app/**`, `routes/**` et
      # `database/**`, jamais `tests/`. Sans cette ligne, une carte corrompue arriverait
      # sur `dev` et sortirait sur la PR de quelqu'un d'autre — la règle posée en haut
      # de ce bloc.
      - 'takussan-api/tests/impact-map.json'
```

Et dans les steps, à la suite des autres gardes :

```yaml
      - name: Carte d'impact — structure et fraîcheur
        run: node scripts/check-impact-map.mjs --report
```

- [ ] **Step 6 : rejouer TOUTES les gardes du dépôt**

```bash
cd /Users/aminethiam/Documents/perso/takussan
for g in scripts/check-*.mjs; do node "$g" >/dev/null 2>&1 || echo "✗ $g"; done; echo "— fin —"
```

Attendu : aucune ligne `✗`.

- [ ] **Step 7 : commit**

```bash
git add scripts/check-impact-map.mjs .github/workflows/repo-ci.yml takussan-api/tests/impact-map.json
git commit -m "feat(ci): garder la carte d'impact — structure en échec, péremption en avertissement (TCK-320)"
```

---

### Task 6 : la CI régénère la carte sur push vers `dev`

**Files:**
- Modify: `.github/workflows/api-ci.yml` — step « Run tests (avec couverture — cliquet TCK-302) »
  et ajout d'un step après les artefacts de couverture.

**Interfaces:**
- Consomme : `bin/build-impact-map.php` (tâche 3).
- Produit : `takussan-api/tests/impact-map.json` à jour sur `dev`.

**Fait établi, à ne pas re-supposer :** `dev` **n'est pas protégée**
(`gh api repos/thiambara/takussan/branches/dev/protection` → 404 « Branch not protected »,
vérifié le 2026-08-17). Le job peut donc pousser directement avec `permissions: contents: write`.

- [ ] **Step 1 : ajouter `--coverage-php` au step de test existant**

Dans `.github/workflows/api-ci.yml`, dans le `run` du step
« Run tests (avec couverture — cliquet TCK-302) », ajouter une ligne à la commande :

```yaml
          php artisan test \
            --coverage \
            --min=86 \
            --coverage-clover=storage/coverage/clover.xml \
            --coverage-html=storage/coverage/html \
            --coverage-php=storage/coverage/cov.php
```

- [ ] **Step 2 : vérifier EN LOCAL que les quatre sorties de couverture cohabitent**

C'est la seule hypothèse non vérifiée de ce plan. PHPUnit accepte plusieurs rapports, mais
`artisan test` interpose sa propre commande (`collision`), et `--min` n'est évalué que si la suite
est verte (`TestCommand.php:130`).

```bash
cd takussan-api
XDEBUG_MODE=coverage php artisan test tests/Unit/Testing/ImpactMapTest.php \
  --coverage --min=0 \
  --coverage-clover=/tmp/clover.xml \
  --coverage-html=/tmp/html \
  --coverage-php=/tmp/cov-quatre.php
ls -la /tmp/clover.xml /tmp/cov-quatre.php && ls /tmp/html | head -3
```

Attendu : les trois sorties existent. **Si `--coverage-php` est ignoré ou entre en conflit**, la
solution de repli est un second appel PHPUnit dans un step séparé du job — plus lent, mais isolé ;
le noter dans le ticket et poursuivre.

- [ ] **Step 3 : ajouter la permission au job**

Dans `.github/workflows/api-ci.yml`, sous `jobs.lint-and-test`, avant `runs-on` :

```yaml
    permissions:
      contents: write
```

- [ ] **Step 4 : ajouter le step de régénération**

Après le step « Publier la couverture (HTML — seulement quand ça rougit) » :

```yaml
      # ────────────────────────────────────────────────────────────────────────
      # La carte d'impact — régénérée sur push vers `dev`, JAMAIS sur une PR.
      #
      # Pourquoi pas sur PR : le fichier serait réécrit par chaque branche et
      # deviendrait un aimant à conflits de merge, pour une donnée que personne ne
      # relit. Sur `dev`, il n'y a qu'un seul écrivain.
      #
      # `[skip ci]` n'est pas une politesse : sans lui, ce push relancerait API CI
      # (le déclencheur couvre `takussan-api/**`, et la carte vit sous
      # `takussan-api/tests/`), qui régénérerait la carte, qui repousserait — une
      # boucle qui ne s'arrête pas toute seule.
      #
      # `dev` n'est pas protégée (vérifié le 2026-08-17 : `gh api
      # repos/thiambara/takussan/branches/dev/protection` → 404). Le jour où elle le
      # devient, ce step échouera au push et devra passer par une PR.
      - name: Régénérer la carte d'impact
        if: github.event_name == 'push' && github.ref == 'refs/heads/dev'
        run: |
          php bin/build-impact-map.php storage/coverage/cov.php tests/impact-map.json

          if git diff --quiet -- tests/impact-map.json; then
            echo "carte inchangée — rien à pousser"
            exit 0
          fi

          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add tests/impact-map.json
          git commit -m "chore(tests): régénérer la carte d'impact [skip ci]"

          # Une seule tentative de rebase : si un autre push est arrivé entretemps, on
          # se replace dessus. Au-delà, on abandonne SANS faire rougir le job — la
          # carte est un index, sa fraîcheur n'est pas une garde (cf.
          # scripts/check-impact-map.mjs).
          git pull --rebase --quiet origin dev || { echo "⚠ rebase impossible — carte non poussée"; exit 0; }
          git push origin HEAD:dev || echo "⚠ push refusé — carte non poussée"
```

- [ ] **Step 5 : valider la syntaxe des deux workflows**

```bash
cd /Users/aminethiam/Documents/perso/takussan
for f in .github/workflows/api-ci.yml .github/workflows/repo-ci.yml; do
  python3 -c "import yaml,sys; yaml.safe_load(open('$f')); print('✓ $f')"
done
```

Attendu : deux lignes `✓`.

- [ ] **Step 6 : commit**

```bash
git add .github/workflows/api-ci.yml
git commit -m "feat(ci): régénérer la carte d'impact sur push vers dev, jamais sur PR (TCK-320)"
```

---

### Task 7 : documentation, et la carte réelle

**Files:**
- Modify: `takussan-api/CLAUDE.md`
- Modify: `CLAUDE.md`
- Create (généré) : `takussan-api/tests/impact-map.json` — la vraie, sur la suite entière.

- [ ] **Step 1 : engendrer la carte réelle**

⚠ **Machine au repos.** Relever la charge à côté du chiffre, sinon il ne veut rien dire.

```bash
uptime; sysctl -n hw.ncpu
cd takussan-api
XDEBUG_MODE=coverage php -d memory_limit=4G artisan test --coverage-php=/tmp/cov-full.php
php bin/build-impact-map.php /tmp/cov-full.php tests/impact-map.json
uptime
```

Attendu, d'après la mesure du 2026-08-17 (891,8 s sous Xdebug, `load average` 2,6 → 9,9, 8 cœurs) :
de l'ordre de **346 classes**, **667 fichiers couverts sur 796 scannés**, **~0,08 Mo**. Ces valeurs
sont des ordres de grandeur : les reporter telles quelles dans un document serait refaire l'erreur
que `CLAUDE.md` documente en ouverture.

- [ ] **Step 2 : mesurer le gain, par ablation**

```bash
cd takussan-api
touch app/Services/Search/PropertySearchService.php
uptime
/usr/bin/time -p php bin/impacted-tests.php --run
uptime
git checkout -- app/Services/Search/PropertySearchService.php
```

Attendu : quelques classes, un temps d'horloge de l'ordre de la dizaine de secondes, à comparer aux
204-235 s de la suite entière au repos. **Reporter le chiffre obtenu, avec sa charge, dans le
ticket** — pas celui du plan.

- [ ] **Step 3 : documenter dans `takussan-api/CLAUDE.md`**

Ajouter une section, en respectant le ton du fichier (dire le motif, pas seulement la commande) :

```markdown
## Ne lancer que les tests que le diff touche

```bash
php bin/impacted-tests.php            # affiche la sélection et la commande
php bin/impacted-tests.php --run      # l'exécute
php bin/impacted-tests.php --base=dev # + tout ce qui sépare HEAD de dev
```

**Pourquoi.** Mesuré le 2026-08-17 : la suite ne contient aucun point chaud — 80 % du temps est
réparti sur 175 classes sur 350 — et **42 % de son temps est le plancher du harnais**, 105,5 ms par
test qui n'exécute rien. Il n'y a donc rien à optimiser dans les tests ; il n'y a qu'à en lancer
moins. Sur les 482 fichiers de `app/` réellement modifiés en 400 commits, **81 % sélectionnent 1 à
5 classes**, soit ~5 s au lieu de 204-235 s.

⚠ **Un vert de cette commande ne dit RIEN de la suite.** C'est une boucle de retour rapide, pas une
garde. La CI et le rituel de fin de branche continuent de jouer les ~2400 tests. Quand la commande
répond `SUITE ENTIÈRE`, elle a raison : c'est le cas de 56 % des commits mergés, et il tombe au
moment où le rituel de fin de branche l'exige de toute façon.

La carte (`tests/impact-map.json`) est **dérivée, jamais éditée à la main** — même règle que
`docs/backlog/INDEX.md`. Elle est régénérée par la CI sur push vers `dev`.
Détail : [`docs/plans/2026-08-17-temps-d-execution-des-tests.md`](../docs/plans/2026-08-17-temps-d-execution-des-tests.md).
```

- [ ] **Step 4 : documenter dans le `CLAUDE.md` racine**

Dans le bloc `takussan-api/` des « commandes réelles », après la ligne `php artisan test --filter=Foo` :

```bash
php bin/impacted-tests.php --run     # ← LA commande du quotidien : ne lance que les tests que
                                     #   le diff touche. ~5 s dans 81 % des cas (mesuré le
                                     #   2026-08-17 sur 482 fichiers réellement modifiés) contre
                                     #   204-235 s pour la suite entière.
                                     #   ⚠ Un vert ici NE DIT RIEN de la suite : c'est une boucle
                                     #   de retour, pas une garde. La CI et le rituel de fin de
                                     #   branche jouent les ~2400 tests, toujours.
```

- [ ] **Step 5 : rejouer toutes les gardes et la suite complète**

```bash
cd /Users/aminethiam/Documents/perso/takussan
for g in scripts/check-*.mjs; do node "$g" >/dev/null 2>&1 || echo "✗ $g"; done
node docs/backlog/gen-index.mjs --check && node docs/gen-features-by-actor.mjs --check
cd takussan-api && ./vendor/bin/pint --test && uptime && php artisan test; uptime
```

Attendu : aucune ligne `✗`, Pint propre, **0 échec** sur la suite. Un rouge Meilisearch se relance
**seul** avant d'être compté (cf. D-44).

- [ ] **Step 6 : commit**

```bash
cd /Users/aminethiam/Documents/perso/takussan
git add takussan-api/tests/impact-map.json takussan-api/CLAUDE.md CLAUDE.md
git commit -m "feat(tests): la carte d'impact réelle, et la commande documentée des deux côtés (TCK-320)"
```

---

## Ce que ce plan ne fait pas

- **Il ne réduit pas le plancher de 105 ms.** Le seul levier mesuré (`config:cache`) rend 6 % et a
  été écarté : il neutraliserait les surcharges d'environnement que `phpunit.xml` pose
  délibérément.
- **Il ne touche pas `--parallel`.** C'est la phase 2, plan séparé.
- **Il ne touche pas la suite frontend.** `vitest` parallélise déjà sur le nombre de cœurs.
- **Il ne change aucune garde existante.** Le cliquet `--min=86` garde exactement le même
  périmètre : c'est la raison pour laquelle la logique vit sous `tests/Support/` et non sous `app/`.

## Vérification finale

- [ ] `for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done` → aucun `✗`
- [ ] `cd takussan-api && ./vendor/bin/pint --test` → propre
- [ ] `php artisan test` → **0 échec**, machine au repos, `uptime` relevé
- [ ] `node scripts/check-impact-map.mjs --report` → structure cohérente
- [ ] `php bin/impacted-tests.php` sur un fichier couvert → sélection partielle, en secondes
- [ ] `php bin/impacted-tests.php` sur une migration → `SUITE ENTIÈRE` avec son motif
- [ ] Le gain mesuré est reporté **dans le ticket**, avec sa charge et son nombre de cœurs
