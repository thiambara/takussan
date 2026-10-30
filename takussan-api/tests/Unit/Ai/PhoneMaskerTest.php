<?php

namespace Tests\Unit\Ai;

use App\Support\PhoneMasker;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** TCK-2383, TCK-2400, TCK-2410 (ADR-0076 §5) — un usage `publique` n'envoie aucun numéro au fournisseur, et garde ses prix. */
class PhoneMaskerTest extends TestCase
{
    /**
     * TCK-2400 — les formes partagées avec `check-ai-evals-pii.mjs`.
     *
     * @return array<string, array{string}>
     */
    private static function formes(string $genre): array
    {
        $formes = json_decode((string) file_get_contents(dirname(__DIR__, 2).'/fixtures/ai/donnees-personnelles.json'), true, flags: JSON_THROW_ON_ERROR);

        return array_map(fn (string $texte): array => [$texte], $formes[$genre]);
    }

    /** @return array<string, array{string}> */
    public static function numeros(): array
    {
        return self::formes('telephones');
    }

    /** @return array<string, array{string}> */
    public static function pasDesNumeros(): array
    {
        return self::formes('pas_personnel');
    }

    /** @return array<string, array{string, string}> */
    public static function avecContexte(): array
    {
        $formes = json_decode((string) file_get_contents(dirname(__DIR__, 2).'/fixtures/ai/donnees-personnelles.json'), true, flags: JSON_THROW_ON_ERROR);

        return $formes['avec_contexte'];
    }

    #[DataProvider('avecContexte')]
    public function test_only_the_number_is_replaced_in_its_context(string $texte, string $masque): void
    {
        $this->assertSame("Écrivez via {$masque} svp", PhoneMasker::mask("Écrivez via {$texte} svp"));
    }

    #[DataProvider('numeros')]
    public function test_a_phone_number_is_masked(string $numero): void
    {
        $this->assertSame('Appelez le '.PhoneMasker::TOKEN.' ce soir', PhoneMasker::mask("Appelez le {$numero} ce soir"));
    }

    /** TCK-2435 (vérification 4) — `F.` en fin de texte reste une marque monétaire ; suivi d'un nom, c'est une initiale. */
    public function test_a_floor_price_ending_with_f_dot_is_kept_but_an_initial_is_not_a_currency(): void
    {
        $this->assertSame('Immeuble R+1 1 250 500 750 F.', PhoneMasker::mask('Immeuble R+1 1 250 500 750 F.'));
        // Un fixe `+7` (hors forme mobile) : seule la règle du `F.` le garde masqué.
        $this->assertSame('RDC [TELEPHONE] F. Diop', PhoneMasker::mask('RDC +7 495 123 45 67 F. Diop'));
    }

    public function test_invalid_utf8_is_scrubbed_then_masked_instead_of_returned_as_is(): void
    {
        $masque = PhoneMasker::mask("\xC3\x28 appelez le 77 123 45 67");

        $this->assertStringNotContainsString('123 45 67', $masque);
        $this->assertStringContainsString(PhoneMasker::TOKEN, $masque);
    }

    #[DataProvider('pasDesNumeros')]
    public function test_prices_and_what_is_not_a_number_are_left_alone(string $texte): void
    {
        $this->assertSame("Prix : {$texte} ce soir", PhoneMasker::mask("Prix : {$texte} ce soir"));
    }

    public function test_only_the_number_is_replaced_around_invisible_and_wide_characters(): void
    {
        $this->assertSame("Awa\u{200B} : [TELEPHONE], ８ pièces", PhoneMasker::mask("Awa\u{200B} : ７７ １２３ ４５ ６７, ８ pièces"));
    }

    /** @return array<string, array{string, string}> */
    public static function autourDUnNumeroEtranger(): array
    {
        return [
            'un chiffre seul derrière' => ['Tel +33 6 12 34 56 78 3 chambres', 'Tel [TELEPHONE] 3 chambres'],
            'un groupe de deux chiffres derrière' => ['Tel +33 6 12 34 56 78 15 chambres', 'Tel [TELEPHONE] 15 chambres'],
            'le (0) de trunk, un groupe derrière' => ['Tel +33 (0)6 12 34 56 78 15 chambres', 'Tel [TELEPHONE] 15 chambres'],
            'un autre indicatif, un chiffre seul derrière' => ['Tel +44 7700 900123 3 chambres', 'Tel [TELEPHONE] 3 chambres'],
            'une surface derrière' => ['+33 6 12 34 56 78 120 m²', '[TELEPHONE] 120 m²'],
            'une initiale derrière : rien ne reste du numéro' => ['+33 6 12 34 56 78 F. Dupont', '[TELEPHONE] F. Dupont'],
            'une marque monétaire derrière' => ['+33 6 12 34 56 78 FCFA', '[TELEPHONE] FCFA'],
            'entre parenthèses' => ['(+33) 6 12 34 56 78', '([TELEPHONE]'],
            'indicatif d\'un chiffre, zone entre parenthèses' => ['+1 (202) 555 0123', '[TELEPHONE]'],
            'deux numéros de formes différentes' => ['+2250712345678 puis 0033612345678', '[TELEPHONE] puis [TELEPHONE]'],
            'deux numéros séparés d\'une seule espace, le sénégalais d\'abord' => ['+221 77 123 45 67 +33 6 12 34 56 78', '[TELEPHONE] [TELEPHONE]'],
            'deux numéros séparés d\'une seule espace, l\'étranger d\'abord' => ['+33 6 12 34 56 78 +221 77 123 45 67', '[TELEPHONE] [TELEPHONE]'],
            'somme de prix entre deux numéros' => ['+33 6 12 34 56 78 puis 150 000 000 F + 250 000 000 F puis +221 77 123 45 67', '[TELEPHONE] puis 150 000 000 F + 250 000 000 F puis [TELEPHONE]'],
            'national : deux numéros' => ['06 12 34 56 78 ou 07 12 34 56 78', '[TELEPHONE] ou [TELEPHONE]'],
        ];
    }

    #[DataProvider('autourDUnNumeroEtranger')]
    public function test_a_foreign_number_is_masked_whole_and_what_follows_it_is_kept(string $texte, string $attendu): void
    {
        $this->assertSame($attendu, PhoneMasker::mask($texte));
    }

    /** @return array<string, array{string}> */
    public static function pasUnNumeroEtranger(): array
    {
        return [
            'plus puis un million, sans marque' => ['Loyer 500 000 + 1 000 000 de caution'],
            'plus puis un milliard' => ['+1 500 000 000 de dette'],
            'indicatif inconnu' => ['+22 12 34 56 78 90'],
            'indicatif trop court pour les chiffres' => ['Total 12 + 33 6 12'],
            'chiffres sans plus ni zéro initial' => ['1234567890123'],
            'jour, mois, année à espaces' => ['rendez-vous le 06 12 2026'],
            'date à points et heure' => ['à 14h30 le 06.12.2026'],
            'date à points suivie d\'une heure à deux chiffres' => ['le 01.05.2026 12 h 30'],
            'prix à points' => ['Terrain 600 m2 prix 35.000.000'],
            'millésime et référence' => ['TK-2026-AB12CD, construit en 2026'],
            'décimales à séparateurs mêlés' => ['load averages: 44.07 87.79 75.17'],
            'zéros d\'un nombre suivis d\'un indicatif' => ['Réf 4500 331 234 567'],
            'trois paires' => ['Chambres : 01 02 03'],
            'numéro sénégalais à préfixe hors du plan, avec indicatif' => ['+221 74 123 45 67'],
        ];
    }

    #[DataProvider('pasUnNumeroEtranger')]
    public function test_what_is_not_a_foreign_number_is_left_alone(string $texte): void
    {
        $this->assertSame($texte, PhoneMasker::mask($texte));
    }

    /** `RadarPhone::canonical()` lit `PATTERN` : il reste le numéro sénégalais, sans le numéro étranger. */
    public function test_the_senegalese_pattern_does_not_read_a_foreign_number(): void
    {
        $this->assertSame(1, preg_match(PhoneMasker::PATTERN, '+221 77 123 45 67'));
        foreach (['+33 6 12 34 56 78', '+2250712345678', '0033612345678', '06.12.34.56.78', '+1 202 555 0123'] as $etranger) {
            $this->assertSame(0, preg_match(PhoneMasker::PATTERN, $etranger), $etranger);
            $this->assertSame(1, preg_match(PhoneMasker::MASK_PATTERN, $etranger), $etranger);
        }
    }
}
