<?php

namespace Tests\Unit\Rules;

use App\Rules\InstantIso;
use App\Rules\JourIso;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2768 — la forme d'une date reçue (un jour) : `AAAA-MM-JJ` strict, jour réel, années bornées. La règle
 * `date` de Laravel laisse passer des formes qu'elle relit de travers (« 99999-01-01 » relu 2009-01-01,
 * « 12/11/2026 » relu le 11 décembre), et `date_format:Y-m-d` seul admet encore « 0099-01-01 ».
 */
class JourIsoTest extends TestCase
{
    /** @return array<string, array{0: string}> */
    public static function admises(): array
    {
        return [
            'jour ordinaire' => ['2026-11-12'],
            '29 février bissextile' => ['2028-02-29'],
            'borne basse' => ['1970-01-01'],
            'borne haute' => [JourIso::ANNEE_MAX.'-12-31'],
        ];
    }

    /** @return array<string, array{0: mixed}> */
    public static function refusees(): array
    {
        return [
            'année à cinq chiffres (relue 2009)' => ['99999-01-01'],
            'année 10000 (relue 2000)' => ['10000-01-01'],
            'année à zéros de tête (admise par date_format)' => ['0099-01-01'],
            'avant la borne basse' => ['1969-12-31'],
            'après la borne haute' => [(JourIso::ANNEE_MAX + 1).'-01-01'],
            'jour/mois/année (relu à l’américaine)' => ['12/11/2026'],
            'instant avec Z' => ['2026-11-12T10:00:00Z'],
            'instant avec espace' => ['2026-11-12 10:00'],
            'semaine ISO' => ['2026-W46'],
            'texte libre' => ['1 Nov 2026'],
            'relatif' => ['tomorrow'],
            'jour inexistant' => ['2026-02-30'],
            '29 février non bissextile' => ['2026-02-29'],
            'mois 13' => ['2026-13-01'],
            'mois sur un chiffre' => ['2026-1-05'],
            'jour sur un chiffre' => ['2026-01-5'],
            'octet nul intérieur' => ["2026-11\0-12"],
            'octet nul final' => ["2026-11-12\0"],
            'saut de ligne final' => ["2026-11-12\n"],
            'espace de tête' => [' 2026-11-12'],
            'entier' => [20261112],
            'tableau' => [['2026-11-12']],
        ];
    }

    #[DataProvider('admises')]
    public function test_un_jour_iso_est_admis(string $valeur): void
    {
        $validator = Validator::make(['x' => $valeur], ['x' => [new JourIso]]);

        $this->assertTrue($validator->passes(), json_encode($valeur).' devrait être admis.');
    }

    #[DataProvider('refusees')]
    public function test_une_forme_qui_n_est_pas_un_jour_iso_est_refusee(mixed $valeur): void
    {
        $validator = Validator::make(['x' => $valeur], ['x' => ['present', new JourIso]]);

        $this->assertTrue($validator->fails(), json_encode($valeur).' devrait être refusée.');
    }

    public function test_nul_reste_l_affaire_de_nullable(): void
    {
        $this->assertTrue(Validator::make(['x' => null], ['x' => ['nullable', new JourIso]])->passes());
    }

    /** Le plancher est celui d'InstantIso, lu par référence ; le plafond est propre au jour (baux longs). */
    public function test_les_bornes(): void
    {
        $this->assertSame(InstantIso::ANNEE_MIN, JourIso::ANNEE_MIN);
        $this->assertGreaterThanOrEqual(InstantIso::ANNEE_MAX, JourIso::ANNEE_MAX);
    }

    public function test_le_refus_porte_son_libelle(): void
    {
        $validator = Validator::make(['x' => '12/11/2026'], ['x' => [new JourIso]]);

        $attendu = __('validation.rules.jour', ['attribute' => 'x', 'min' => JourIso::ANNEE_MIN, 'max' => JourIso::ANNEE_MAX]);
        $this->assertSame([$attendu], $validator->errors()->get('x'));
        $this->assertStringContainsString((string) JourIso::ANNEE_MAX, $attendu, 'Le libellé dit le plafond de la constante.');
        $this->assertNotSame('validation.rules.jour', __('validation.rules.jour'));
    }
}
