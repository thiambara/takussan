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
     * @return array<string,mixed> prêt pour `json_encode`
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
     * @return list<string>|null `null` = fichier INCONNU de la carte (l'appelant doit
     *                           escalader sur la suite entière) ; `[]` = fichier connu
     *                           que AUCUN test ne couvre (rien à lancer).
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
