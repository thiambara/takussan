<?php

namespace Tests\Unit\Support;

use App\Support\NomPublic;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-537 (décision du porteur du 2026-11-16) — le nom d'une personne montrée au public : prénom +
 * initiale du nom, et le nom de famille ne sort jamais en entier, par aucun repli.
 */
class NomPublicTest extends TestCase
{
    /** @return array<string, array{0: ?string, 1: ?string, 2: ?string, 3: ?string}> */
    public static function cas(): array
    {
        return [
            'prénom et nom' => ['Awa', 'Ndiaye', 'awa', 'Awa N.'],
            'nom composé : une seule initiale' => ['Awa', 'Ba Ndiaye', null, 'Awa B.'],
            'initiale accentuée, en capitale' => ['Awa', 'élise', null, 'Awa É.'],
            'prénom seul' => ['Awa', '', null, 'Awa'],
            'nom seul' => ['', 'Ndiaye', null, 'N.'],
            'blancs autour' => ['  Awa ', ' Ndiaye ', null, 'Awa N.'],
            'identifiant en deux mots' => [null, null, 'awa.ndiaye', 'awa N.'],
            'identifiant adresse' => ['', '', 'awa.ndiaye@exemple.sn', 'awa N.'],
            'identifiant d’un seul mot' => [null, null, 'awa', 'awa'],
            'rien' => [null, null, null, null],
            'que des séparateurs' => ['', '', '._-', null],
        ];
    }

    #[DataProvider('cas')]
    public function test_la_forme_abregee(?string $prenom, ?string $nom, ?string $username, ?string $attendu): void
    {
        $this->assertSame($attendu, NomPublic::abrege($prenom, $nom, $username));
    }

    public function test_le_nom_de_famille_ne_sort_jamais_en_entier(): void
    {
        foreach ([['Awa', 'Ndiouckmbaye', null], ['', 'Ndiouckmbaye', null], [null, null, 'awa.ndiouckmbaye@x.sn'], [null, null, 'awa ndiouckmbaye']] as [$p, $n, $u]) {
            $this->assertStringNotContainsStringIgnoringCase('ndiouckmbaye', (string) NomPublic::abrege($p, $n, $u));
        }
    }
}
