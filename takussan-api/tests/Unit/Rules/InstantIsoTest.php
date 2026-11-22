<?php

namespace Tests\Unit\Rules;

use App\Rules\InstantIso;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2752 — la forme d'une date-heure reçue : ISO 8601 strict, années bornées. La règle `date` de
 * Laravel laisse passer des formes qu'elle relit de travers (« 99999-01-01 » relu 2009-01-01).
 */
class InstantIsoTest extends TestCase
{
    /** @return array<string, array{0: string}> */
    public static function admises(): array
    {
        return [
            'date seule' => ['2026-11-12'],
            'minutes, T' => ['2026-11-12T10:00'],
            'minutes, espace' => ['2026-11-12 10:00'],
            'secondes, espace (fin d’absence du front)' => ['2026-11-12 23:59:59'],
            'secondes sans décalage' => ['2026-11-12T10:00:00'],
            'Z' => ['2026-11-12T10:00:00Z'],
            'toISOString() : 3 chiffres' => ['2026-11-12T10:00:00.000Z'],
            'Carbon : 6 chiffres' => ['2026-11-12T10:00:00.000000Z'],
            'décalage étendu' => ['2026-11-12T10:00:00+01:00'],
            'décalage négatif' => ['2026-11-12T10:00:00-01:00'],
            'décalage basique' => ['2026-11-12T10:00:00+0100'],
            'minutes et Z' => ['2026-11-12T10:00Z'],
            'borne basse' => ['1970-01-01'],
            'borne haute' => ['2100-12-31T23:59:59Z'],
            '29 février bissextile' => ['2028-02-29'],
            'décalage maximal' => ['2026-11-12T10:00:00+14:00'],
        ];
    }

    /** @return array<string, array{0: mixed}> */
    public static function refusees(): array
    {
        return [
            'année à cinq chiffres (relue 2009)' => ['99999-01-01'],
            'année à zéros de tête (relue 0099)' => ['0099-01-01'],
            'année 10000 (relue 2000)' => ['10000-01-01'],
            'octet nul final' => ["2026-11-12\0"],
            'octet nul intérieur (relu 05:00 UTC)' => ["2026-11-12T10:00\0+05:00"],
            'saut de ligne final' => ["2026-11-12\n"],
            'avant la borne basse' => ['1969-12-31'],
            'après la borne haute' => ['2101-01-01'],
            'jour inexistant' => ['2026-02-30'],
            '29 février non bissextile' => ['2026-02-29'],
            'mois 13' => ['2026-13-01'],
            'heure 24' => ['2026-11-12T24:00:00'],
            'heure 25' => ['2026-11-12T25:00'],
            'minute 60' => ['2026-11-12T10:60'],
            'seconde 60' => ['2026-11-12T10:00:60'],
            'heure sans minutes' => ['2026-11-12T10Z'],
            'décalage sur une date seule' => ['2026-11-12Z'],
            'décalage hors bornes' => ['2026-11-12T10:00:00+15:00'],
            'décalage au-delà de 14 h' => ['2026-11-12T10:00:00+14:30'],
            'décalage à minutes 60' => ['2026-11-12T10:00:00+01:60'],
            'décalage en heures seules' => ['2026-11-12T10:00:00+01'],
            'fraction à 7 chiffres' => ['2026-11-12T10:00:00.1234567Z'],
            'fraction sans secondes' => ['2026-11-12T10:00.5Z'],
            'forme compacte' => ['20261112T100000Z'],
            'minuscules' => ['2026-11-12t10:00:00z'],
            'jour/mois/année (relu à l’américaine)' => ['12/11/2026'],
            'texte libre' => ['1 Nov 2026'],
            'semaine ISO' => ['2026-W46'],
            'relatif' => ['tomorrow'],
            'espace de tête' => [' 2026-11-12'],
            'deux espaces' => ['2026-11-12  10:00'],
            'entier' => [1763000000],
            'tableau' => [['2026-11-12']],
        ];
    }

    #[DataProvider('admises')]
    public function test_une_forme_iso_valide_est_admise(string $valeur): void
    {
        $validator = Validator::make(['x' => $valeur], ['x' => [new InstantIso]]);

        $this->assertTrue($validator->passes(), json_encode($valeur).' devrait être admise.');
    }

    #[DataProvider('refusees')]
    public function test_une_forme_relue_de_travers_est_refusee(mixed $valeur): void
    {
        $validator = Validator::make(['x' => $valeur], ['x' => ['present', new InstantIso]]);

        $this->assertTrue($validator->fails(), json_encode($valeur).' devrait être refusée.');
    }

    public function test_nul_reste_l_affaire_de_nullable(): void
    {
        $this->assertTrue(Validator::make(['x' => null], ['x' => ['nullable', new InstantIso]])->passes());
    }

    public function test_le_refus_porte_son_libelle(): void
    {
        $validator = Validator::make(['x' => '99999-01-01'], ['x' => [new InstantIso]]);

        $this->assertSame([__('validation.rules.instant', ['attribute' => 'x'])], $validator->errors()->get('x'));
        $this->assertNotSame('validation.rules.instant', __('validation.rules.instant'));
    }
}
