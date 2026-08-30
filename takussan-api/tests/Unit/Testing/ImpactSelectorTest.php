<?php

namespace Tests\Unit\Testing;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Support\ImpactMap;
use Tests\Support\ImpactSelector;

/**
 * Les huit règles de sélection. Cinq d'entre elles existent pour ESCALADER, pas
 * pour sélectionner : un sélecteur qui se trompe en sélectionnant trop coûte du
 * temps, un sélecteur qui se trompe en sélectionnant trop peu produit un FAUX VERT.
 * Les tests ci-dessous sont écrits dans ce sens-là.
 */
class ImpactSelectorTest extends TestCase
{
    /**
     * @param  array<string,list<string>>  $consommateurs  domaine de `lang/` → ce qui le cite.
     */
    private function selector(array $consommateurs = []): ImpactSelector
    {
        return new ImpactSelector($this->map(), fn (string $domaine): array => $consommateurs[$domaine] ?? []);
    }

    private function map(): ImpactMap
    {
        return ImpactMap::fromJson(json_encode([
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
        ]));
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
            ['takussan-api/database/factories/PropertyFactory.php'],
            ['takussan-api/database/seeders/UserSeeder.php'],
            // C-1 : les fichiers de harnais que la version précédente ignorait EN
            // SILENCE (whitelist à défaut « ignorer », cf. le docblock de la classe).
            // TCK-309 — `tests/BaseTestCase.php` tenait ce rôle jusqu'à sa fusion
            // dans `tests/TestCase.php` ; `MeilisearchBarrier` est le même cas de
            // figure et existe, lui : un fichier de `tests/` qui n'est pas une
            // classe de test et n'est dans aucune liste dure.
            ['takussan-api/tests/Support/MeilisearchBarrier.php'],
            ['takussan-api/tests/ApiTestCase.php'],
            ['takussan-api/tests/Concerns/InteractsWithMeilisearch.php'],
            ['takussan-api/tests/Support/TestProcessToken.php'],
            // C-1 : chemins hors `tests/`/`routes/`/`config/`/`app/`, même défaut.
            ['takussan-api/.env.example'],
            // TCK-476 — `lang/` n'escalade plus en bloc, mais `validation.php` reste un
            // dictionnaire du FRAMEWORK : il porte le message de chaque 422 du dépôt, et
            // aucun balayage de `app/` ne peut en nommer les consommateurs.
            ['takussan-api/lang/fr/validation.php'],
            ['takussan-api/resources/views/pdf/invoice.blade.php'],
            // I-6 : `config/` n'a plus le repli conçu pour `routes/` — déclencheur dur.
            ['takussan-api/config/scout.php'],
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

    /**
     * C-1 corrige le défaut « ignorer », mais la classe garde une liste EXPLICITE
     * de chemins réellement inertes (`INERT_PREFIXES`) pour ne pas devenir bruyante.
     * Ce test garde cette liste : si elle change de sens, c'est ici que ça casse.
     */
    public function test_genuinely_inert_paths_still_select_nothing(): void
    {
        $s = $this->selector()->select([
            'takussan-api/storage/logs/laravel.log',
            'takussan-api/vendor/foo/bar.php',
            'takussan-api/README.md',
        ], $this->noDiff(), []);

        $this->assertFalse($s->fullSuite);
        $this->assertSame([], $s->classes);
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

    // ── TCK-476 : les fichiers de `lang/` ────────────────────────────────────
    //
    // Le repli n'est PAS remplacé, il est BORNÉ à ce qu'on sait situer. Les six
    // tests ci-dessous sont donc écrits dans les deux sens : un qui sélectionne,
    // CINQ qui escaladent.

    public function test_an_application_dictionary_selects_the_classes_covering_its_consumers(): void
    {
        $s = $this->selector([
            'invitations' => ['app/Http/Controllers/PropertyController.php'],
        ])->select(['takussan-api/lang/en/invitations.php'], $this->noDiff(), []);

        $this->assertFalse($s->fullSuite, (string) $s->reason);
        $this->assertSame(['Tests\Feature\Api\PropertyCrudTest'], $s->classes);
    }

    public function test_a_dictionary_consumed_by_a_test_class_selects_that_class(): void
    {
        $s = $this->selector([
            'team' => ['tests/Feature/Api/TeamTest.php', 'app/Support/Price.php'],
        ])->select(['takussan-api/lang/wo/team.php'], $this->noDiff(), []);

        $this->assertFalse($s->fullSuite, (string) $s->reason);
        $this->assertSame(['Tests\Feature\Api\TeamTest', 'Tests\Unit\PriceTest'], $s->classes);
    }

    /**
     * @return list<array{0:string}>
     */
    public static function dictionnairesDuFramework(): array
    {
        return [['auth'], ['pagination'], ['passwords'], ['validation']];
    }

    /**
     * Ceux-là escaladent MÊME si un consommateur est résolu : le framework les lit
     * lui-même, depuis du code que rien dans `app/` ne cite. `validation.php` porte
     * le message de chaque 422 du dépôt et n'est écrit que par 13 fichiers de `app/` —
     * une sélection de 13 consommateurs y serait un faux vert.
     */
    #[DataProvider('dictionnairesDuFramework')]
    public function test_a_framework_dictionary_escalates(string $domaine): void
    {
        $s = $this->selector([$domaine => ['app/Support/Price.php']])
            ->select(["takussan-api/lang/fr/$domaine.php"], $this->noDiff(), []);

        $this->assertTrue($s->fullSuite);
        $this->assertStringContainsString('framework', (string) $s->reason);
    }

    public function test_a_dictionary_without_any_resolved_consumer_escalates(): void
    {
        $s = $this->selector()->select(['takussan-api/lang/fr/inconnu.php'], $this->noDiff(), []);

        $this->assertTrue($s->fullSuite);
        $this->assertStringContainsString('aucun consommateur', (string) $s->reason);
    }

    /**
     * @return list<array{0:string}>
     */
    public static function cheminsDeLangueHorsForme(): array
    {
        return [
            ['takussan-api/lang/en.json'],          // traductions par chaîne
            ['takussan-api/lang/en/vendor/x/y.php'], // dictionnaire de paquet publié
            ['takussan-api/lang/README.md'],
        ];
    }

    #[DataProvider('cheminsDeLangueHorsForme')]
    public function test_a_lang_path_of_unexpected_shape_escalates(string $path): void
    {
        $s = $this->selector()->select([$path], $this->noDiff(), []);

        $this->assertTrue($s->fullSuite, "$path devrait imposer la suite entière");
        $this->assertStringContainsString('forme inattendue', (string) $s->reason);
    }

    public function test_a_consumer_absent_from_the_map_escalates(): void
    {
        $s = $this->selector(['owners' => ['app/Models/ToutNeuf.php']])
            ->select(['takussan-api/lang/fr/owners.php'], $this->noDiff(), []);

        $this->assertTrue($s->fullSuite);
        $this->assertStringContainsString('absent de la carte', (string) $s->reason);
    }

    public function test_a_consumer_in_the_harness_or_outside_app_escalates(): void
    {
        $harnais = $this->selector(['owners' => ['tests/Support/MeilisearchBarrier.php']])
            ->select(['takussan-api/lang/fr/owners.php'], $this->noDiff(), []);

        $this->assertTrue($harnais->fullSuite);
        $this->assertStringContainsString('harnais', (string) $harnais->reason);

        // Une vue dont aucun fichier de `app/` ne cite le nom : `TranslationUsage` la
        // rend telle quelle plutôt que de la taire, et on ne sait pas la situer.
        $vue = $this->selector(['owners' => ['resources/views/emails/orphan.blade.php']])
            ->select(['takussan-api/lang/fr/owners.php'], $this->noDiff(), []);

        $this->assertTrue($vue->fullSuite);
        $this->assertStringContainsString('non situable', (string) $vue->reason);
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
