<?php

namespace Tests\Unit\Support;

use App\Rules\TelephoneJoignable;
use App\Services\Admin\AdminGlobalSearchService;
use App\Services\Crm\CustomerPhoneNormalizer;
use App\Support\TelephoneSaisi;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

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

    /** Ramenée à E.164 et ACCEPTÉE comme numéro de contact — ce qui ne dit pas qu'elle reçoit un SMS (m7). */
    #[DataProvider('saisies')]
    public function test_la_saisie_est_ramenee_a_e164_et_acceptee(string $saisie, string $attendu): void
    {
        $normalise = TelephoneSaisi::normaliser($saisie);

        $this->assertSame($attendu, $normalise);
        $this->assertNull(TelephoneJoignable::defaut($normalise));
        $this->assertTrue($this->passeLaRegle($normalise));
    }

    /** m7 — un fixe sénégalais est un contact, pas un destinataire de SMS ; un mobile, si. */
    public function test_seul_un_mobile_recoit_les_sms(): void
    {
        $this->assertTrue(TelephoneSaisi::recoitLesSms('+221771234567'));
        $this->assertFalse(TelephoneSaisi::recoitLesSms('+221338201234'));
        $this->assertTrue(TelephoneSaisi::recoitLesSms('+33612345678'));
        $this->assertFalse(TelephoneSaisi::recoitLesSms(null));
    }

    /** @return array<string, array{string}> */
    public static function indicatifsManquants(): array
    {
        return [
            '+ devant le national' => ['+77 123 45 67'],
            '00 devant le national' => ['00 77 123 45 67'],
            '+ devant le fixe' => ['+33 820 12 34'],
        ];
    }

    /**
     * m6 — un `+` (ou `00`) devant un numéro national nu donnait `+771234567` : la forme E.164, un
     * « +7 » à neuf chiffres que rien n'achemine. La règle le refuse au lieu de le fabriquer.
     */
    #[DataProvider('indicatifsManquants')]
    public function test_un_indicatif_manquant_est_refuse(string $saisie): void
    {
        $this->assertFalse($this->passeLaRegle((string) TelephoneSaisi::normaliser($saisie)));
    }

    /** @return array<string, array{string, string}> */
    public static function saisiesCommunes(): array
    {
        return [
            'fixe 30 espacé' => ['30 123 45 67', '+221301234567'],
            'mobile à barres obliques' => ['77/123/45/67', '+221771234567'],
            'mobile national espacé' => ['77 123 45 67', '+221771234567'],
            'fixe 33' => ['33 820 12 34', '+221338201234'],
            'E.164 à tirets' => ['+221 77-123-45-67', '+221771234567'],
            'préfixe 00' => ['00221771234567', '+221771234567'],
            'indicatif sans +' => ['221771234567', '+221771234567'],
        ];
    }

    /**
     * P125.05 (TCK-2025) — les trois normaliseurs de saisie (fiche client, recherche de la console,
     * formulaires publics) rendent le même numéro pour la même saisie : ils passent tous par
     * {@see TelephoneSaisi::normaliser()}, qui accepte l'indicatif fixe `30` comme la fiche client.
     */
    #[DataProvider('saisiesCommunes')]
    public function test_p125_05_les_trois_points_de_saisie_rendent_le_meme_numero(string $saisie, string $attendu): void
    {
        $this->assertSame($attendu, TelephoneSaisi::normaliser($saisie), 'TelephoneSaisi');
        $this->assertSame($attendu, CustomerPhoneNormalizer::normalize($saisie), 'CustomerPhoneNormalizer');
        $this->assertSame($attendu, AdminGlobalSearchService::phoneCandidate($saisie), 'recherche de la console');
        $this->assertTrue($this->passeLaRegle($attendu));
    }

    /** P125.05 — un `+` devant un fixe `30` nu est un indicatif manquant, comme devant le `33`. */
    public function test_p125_05_un_plus_devant_le_fixe_30_est_un_indicatif_manquant(): void
    {
        $this->assertFalse($this->passeLaRegle((string) TelephoneSaisi::normaliser('+30 123 45 67')));
        $this->assertFalse(TelephoneSaisi::recoitLesSms('+221301234567'), 'un fixe ne reçoit pas de SMS');
    }

    private function passeLaRegle(string $valeur): bool
    {
        $echec = false;
        (new TelephoneSaisi)->validate('phone', $valeur, function () use (&$echec) {
            $echec = true;
        });

        return ! $echec;
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
