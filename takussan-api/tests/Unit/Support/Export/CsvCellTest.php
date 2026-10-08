<?php

namespace Tests\Unit\Support\Export;

use App\Support\Export\CsvCell;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** TCK-601 (verif-601 m3) — une cellule ne s'exécute pas comme formule ; un nombre reste un nombre. */
class CsvCellTest extends TestCase
{
    /** @return array<string, array{mixed, mixed}> */
    public static function cellules(): array
    {
        return [
            'formule' => ['=1+1', "'=1+1"],
            'plus' => ['+cmd', "'+cmd"],
            'moins' => ['-cmd', "'-cmd"],
            'arobase' => ['@SUM(A1)', "'@SUM(A1)"],
            'tabulation' => ["\t=1", "'\t=1"],
            'retour chariot' => ["\r=1", "'\r=1"],
            'montant négatif' => ['-1500', '-1500'],
            'décimal signé' => ['+3.5', '+3.5'],
            'entier' => [-1500, -1500],
            'texte' => ['Villa', 'Villa'],
            'vide' => ['', ''],
            'nul' => [null, null],
        ];
    }

    #[DataProvider('cellules')]
    public function test_neutralise(mixed $entree, mixed $attendu): void
    {
        $this->assertSame($attendu, CsvCell::neutralize($entree));
    }
}
