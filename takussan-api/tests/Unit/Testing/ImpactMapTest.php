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
