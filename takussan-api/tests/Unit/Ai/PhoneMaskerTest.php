<?php

namespace Tests\Unit\Ai;

use App\Support\PhoneMasker;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** TCK-2383, TCK-2400 (ADR-0076 §5) — un usage `publique` n'envoie aucun numéro sénégalais au fournisseur, et garde ses prix. */
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

    #[DataProvider('pasDesNumeros')]
    public function test_prices_and_what_is_not_a_number_are_left_alone(string $texte): void
    {
        $this->assertSame("Prix : {$texte} ce soir", PhoneMasker::mask("Prix : {$texte} ce soir"));
    }

    public function test_only_the_number_is_replaced_around_invisible_and_wide_characters(): void
    {
        $this->assertSame("Awa\u{200B} : [TELEPHONE], ８ pièces", PhoneMasker::mask("Awa\u{200B} : ７７ １２３ ４５ ６７, ８ pièces"));
    }
}
