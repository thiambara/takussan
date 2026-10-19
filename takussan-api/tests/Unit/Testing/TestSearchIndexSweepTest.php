<?php

namespace Tests\Unit\Testing;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestSearchIndex;

/**
 * TCK-975 (P53.04) — le balayage des index orphelins `testing_<jeton>_*`.
 *
 * 1. L'âge se lit sur la DERNIÈRE ÉCRITURE de l'index (`updatedAt`), plus sur
 *    sa création : une exécution très chargée (×11 sous charge, jusqu'à
 *    ~6 700 s) dépasse les deux heures, et une exécution concurrente lui
 *    arrachait alors un index encore actif.
 * 2. La liste des index se lit EN ENTIER : `GET /indexes` pagine, et une seule
 *    page de 1 000 laissait le reste ni balayé ni supprimé.
 *
 * Test unitaire pur : aucun moteur, des dates et des pages factices.
 */
class TestSearchIndexSweepTest extends TestCase
{
    private const MINE = 'testing_aaaaaa_';

    private DateTimeImmutable $cutoff;

    protected function setUp(): void
    {
        $this->cutoff = new DateTimeImmutable('2026-10-19 10:00:00');
    }

    public function test_an_old_but_recently_written_index_is_not_an_orphan(): void
    {
        $this->assertFalse(TestSearchIndex::isOrphan(
            'testing_bbbbbb_properties',
            createdAt: new DateTimeImmutable('2026-10-19 07:00:00'),
            updatedAt: new DateTimeImmutable('2026-10-19 10:30:00'),
            mine: self::MINE,
            cutoff: $this->cutoff,
        ));
    }

    public function test_an_old_and_idle_index_is_an_orphan(): void
    {
        $this->assertTrue(TestSearchIndex::isOrphan(
            'testing_bbbbbb_properties',
            createdAt: new DateTimeImmutable('2026-10-19 07:00:00'),
            updatedAt: new DateTimeImmutable('2026-10-19 07:05:00'),
            mine: self::MINE,
            cutoff: $this->cutoff,
        ));
    }

    public function test_without_any_date_the_sweep_abstains(): void
    {
        $this->assertFalse(TestSearchIndex::isOrphan('testing_bbbbbb_properties', null, null, self::MINE, $this->cutoff));
    }

    public function test_own_indexes_and_foreign_names_are_never_orphans(): void
    {
        $old = new DateTimeImmutable('2026-10-18 00:00:00');

        $this->assertFalse(TestSearchIndex::isOrphan(self::MINE.'properties', $old, $old, self::MINE, $this->cutoff));
        $this->assertFalse(TestSearchIndex::isOrphan('smoke_properties', $old, $old, self::MINE, $this->cutoff));
        $this->assertFalse(TestSearchIndex::isOrphan('testing_properties', $old, $old, self::MINE, $this->cutoff));
    }

    public function test_every_page_of_indexes_is_read(): void
    {
        $all = array_map(fn (int $i) => "testing_bbbbbb_{$i}", range(1, 2500));
        $calls = [];

        $read = TestSearchIndex::readAllPages(function (int $offset, int $limit) use ($all, &$calls) {
            $calls[] = [$offset, $limit];

            return array_slice($all, $offset, $limit);
        }, pageSize: 1000);

        $this->assertSame($all, $read);
        $this->assertSame([[0, 1000], [1000, 1000], [2000, 1000]], $calls);
    }

    public function test_a_server_that_ignores_the_offset_does_not_loop_forever(): void
    {
        $read = TestSearchIndex::readAllPages(fn (int $offset, int $limit) => array_fill(0, $limit, 'x'), pageSize: 10, maxPages: 3);

        $this->assertCount(30, $read);
    }
}
