<?php

namespace Tests\Unit\Services;

use App\Models\Enums\Currency;
use App\Services\Formatting\CurrencyFormatter;
use PHPUnit\Framework\TestCase;

/**
 * TCK-084 — locks the AC4-AC6 contract for the backend currency formatter.
 *
 * The assertions normalise NBSP/NNBSP to a regular space so the test runs
 * against any ICU build (ICU 72+ uses U+202F, older builds use U+00A0).
 */
class CurrencyFormatterTest extends TestCase
{
    private CurrencyFormatter $formatter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->formatter = new CurrencyFormatter;
    }

    public function test_xof_uses_zero_decimals_and_trailing_symbol(): void
    {
        $out = $this->normalize($this->formatter->format(150_000, Currency::XOF));

        $this->assertSame('150 000 F CFA', $out);
    }

    public function test_eur_uses_comma_decimal_and_trailing_symbol(): void
    {
        $out = $this->normalize($this->formatter->format(150_000.5, Currency::EUR));

        $this->assertSame('150 000,50 €', $out);
    }

    public function test_usd_uses_dot_decimal_and_leading_symbol(): void
    {
        $out = $this->formatter->format(150_000, Currency::USD);

        $this->assertSame('$150,000.00', $out);
    }

    public function test_format_round_trips_to_parse_for_each_currency(): void
    {
        foreach ([Currency::XOF, Currency::EUR, Currency::USD] as $currency) {
            $value = $currency === Currency::XOF ? 12_000.0 : 12_345.67;
            $rendered = $this->formatter->format($value, $currency);
            $parsed = $this->formatter->parse($rendered, $currency);

            $expected = $currency === Currency::XOF ? 12_000.0 : 12_345.67;
            $this->assertEqualsWithDelta(
                $expected,
                $parsed,
                0.01,
                "Round-trip failed for {$currency->value}",
            );
        }
    }

    /**
     * TCK-726 (P26.02) — un demi s'arrondit vers le haut, comme `round()` (PHP_ROUND_HALF_UP)
     * à l'encaissement (`amountDue()`, `PayoutCalculator`). Sans mode d'arrondi, ICU arrondit au
     * pair : 1 250,5 s'imprimait 1 250 quand on en encaissait 1 251, et une facture PDF à
     * 100 025 + 18 004,5 de TVA imprimait une TVA de 18 004 pour un total de 118 030.
     */
    public function test_a_half_rounds_up_like_the_amount_charged(): void
    {
        $this->assertSame('1 251 F CFA', $this->normalize($this->formatter->format(1_250.5, Currency::XOF)));
        $this->assertSame('18 005 F CFA', $this->normalize($this->formatter->format(18_004.5, Currency::XOF)));
        $this->assertSame('118 030 F CFA', $this->normalize($this->formatter->format(118_029.5, Currency::XOF)));
        // 2,125 est exact en binaire : seul le mode d'arrondi décide entre 2,12 et 2,13.
        $this->assertSame('2,13 €', $this->normalize($this->formatter->format(2.125, Currency::EUR)));
    }

    public function test_parse_strips_currency_symbol_before_decoding(): void
    {
        // The locale-aware parser would otherwise stop at the `€` sign.
        $this->assertEqualsWithDelta(
            1_234.56,
            $this->formatter->parse("1\u{00A0}234,56\u{00A0}€", Currency::EUR),
            0.01,
        );

        $this->assertEqualsWithDelta(
            1_234.56,
            $this->formatter->parse('$1,234.56', Currency::USD),
            0.01,
        );
    }

    public function test_parse_falls_back_to_regex_for_unparseable_strings(): void
    {
        // Empty / pure-noise input must not throw.
        $this->assertSame(0.0, $this->formatter->parse('not a number', Currency::EUR));
    }

    /**
     * Replace any non-ASCII space characters with a regular space — keeps
     * assertions deterministic across ICU versions.
     */
    private function normalize(string $value): string
    {
        return preg_replace('/[\x{00A0}\x{202F}\x{2009}]/u', ' ', $value) ?? $value;
    }
}
