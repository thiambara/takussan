<?php

namespace Tests\Unit\Ai;

use App\Support\PhoneMasker;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** TCK-2383 (ADR-0076 §5) — un usage `publique` n'envoie aucun numéro sénégalais au fournisseur. */
class PhoneMaskerTest extends TestCase
{
    /** @return array<string, array{string}> */
    public static function numeros(): array
    {
        return [
            'espaces' => ['77 123 45 67'],
            'collé' => ['771234567'],
            'indicatif' => ['+221 78 123 45 67'],
            'double zéro' => ['00221761234567'],
            'points' => ['70.123.45.67'],
            'fixe' => ['33 821 00 00'],
            'espace insécable' => ["77\u{00A0}123\u{00A0}45\u{00A0}67"],
            'espace fine insécable' => ["+221\u{202F}77\u{202F}123\u{202F}45\u{202F}67"],
        ];
    }

    #[DataProvider('numeros')]
    public function test_a_senegalese_number_is_masked(string $numero): void
    {
        $this->assertSame('Appelez le '.PhoneMasker::TOKEN.' ce soir', PhoneMasker::mask("Appelez le {$numero} ce soir"));
    }

    public function test_invalid_utf8_is_scrubbed_then_masked_instead_of_returned_as_is(): void
    {
        $masque = PhoneMasker::mask("\xC3\x28 appelez le 77 123 45 67");

        $this->assertStringNotContainsString('123 45 67', $masque);
        $this->assertStringContainsString(PhoneMasker::TOKEN, $masque);
    }

    public function test_prices_and_surfaces_are_left_alone(): void
    {
        $texte = 'Villa de 450 m², 150 000 000 FCFA, 4 chambres';

        $this->assertSame($texte, PhoneMasker::mask($texte));
    }
}
