<?php

namespace Tests\Unit\Support;

use App\Rules\TelephoneJoignable;
use App\Support\TelephoneSaisi;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-590 — relevé par TCK-588 : « 77 123 45 67 » était enregistré tel quel et le rappel de
 * visite ne partait jamais. La saisie est ramenée à E.164, et rien d'autre n'est deviné.
 */
class TelephoneSaisiTest extends TestCase
{
    /** @return array<string, array{string, string}> */
    public static function saisies(): array
    {
        return [
            'mobile national espacé' => ['77 123 45 67', '+221771234567'],
            'mobile national à points' => ['78.765.43.21', '+221787654321'],
            'mobile national collé' => ['701234567', '+221701234567'],
            'fixe national' => ['33 820 12 34', '+221338201234'],
            'E.164 à séparateurs' => ['+221 77 123-45.67', '+221771234567'],
            'préfixe 00' => ['00221 77 123 45 67', '+221771234567'],
            'indicatif sans +' => ['221771234567', '+221771234567'],
            'étranger en 00' => ['0033 6 12 34 56 78', '+33612345678'],
            'déjà E.164' => ['+221771234567', '+221771234567'],
        ];
    }

    #[DataProvider('saisies')]
    public function test_la_saisie_est_ramenee_a_e164_joignable(string $saisie, string $attendu): void
    {
        $normalise = TelephoneSaisi::normaliser($saisie);

        $this->assertSame($attendu, $normalise);
        $this->assertNull(TelephoneJoignable::defaut($normalise));
    }

    /** @return array<string, array{string}> */
    public static function inconnues(): array
    {
        return [
            'huit chiffres' => ['77 123 45 6'],
            'préfixe sénégalais inconnu' => ['61 234 56 78'],
            'national français' => ['06 12 34 56 78'],
            'texte' => ['appelez-moi'],
        ];
    }

    /** Rien n'est deviné : ce qui ne prend aucune forme connue reste refusé par la règle. */
    #[DataProvider('inconnues')]
    public function test_rien_n_est_devine(string $saisie): void
    {
        $this->assertNotNull(TelephoneJoignable::defaut((string) TelephoneSaisi::normaliser($saisie)));
    }

    public function test_une_valeur_non_textuelle_passe_inchangee(): void
    {
        $this->assertNull(TelephoneSaisi::normaliser(null));
        $this->assertSame(771234567, TelephoneSaisi::normaliser(771234567));
    }
}
