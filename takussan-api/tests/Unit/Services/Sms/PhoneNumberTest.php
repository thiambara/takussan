<?php

namespace Tests\Unit\Services\Sms;

use App\Services\Notifications\Sms\PhoneNumber;
use PHPUnit\Framework\TestCase;

/**
 * TCK-102 — Locks the E.164 surface area used as the entrypoint of the
 * SMS router. Anything that doesn't satisfy the regex must be rejected
 * before any provider is touched (AC12).
 */
class PhoneNumberTest extends TestCase
{
    public function test_rejects_malformed_numbers(): void
    {
        $this->assertFalse(PhoneNumber::isValid(''));
        $this->assertFalse(PhoneNumber::isValid('221770000000'));
        $this->assertFalse(PhoneNumber::isValid('+0123456789'));
        $this->assertFalse(PhoneNumber::isValid('+22177'));
        $this->assertFalse(PhoneNumber::isValid('+221abcd45678'));
    }

    public function test_accepts_well_formed_e164(): void
    {
        $this->assertTrue(PhoneNumber::isValid('+221771234567'));
        $this->assertTrue(PhoneNumber::isValid('+447911123456'));
        $this->assertTrue(PhoneNumber::isValid('+12025550182'));
    }

    public function test_normalize_strips_spaces_and_throws_on_invalid(): void
    {
        $this->assertSame('+221771234567', PhoneNumber::normalize(' +221 77 123 4567 '));

        $this->expectException(\InvalidArgumentException::class);
        PhoneNumber::normalize('not-a-phone');
    }

    public function test_senegal_national_prefix_returns_two_digits_only_for_221(): void
    {
        $this->assertSame('77', PhoneNumber::senegalNationalPrefix('+221771234567'));
        $this->assertSame('70', PhoneNumber::senegalNationalPrefix('+221701234567'));
        $this->assertNull(PhoneNumber::senegalNationalPrefix('+447911123456'));
    }

    /**
     * TCK-574 — un 0 de préfixe national derrière l'indicatif (`+33 0612345678`) est un numéro
     * que le réseau n'acheminera pas, bien qu'il ait la FORME E.164. Sauf là où ce 0 est un
     * chiffre du numéro : Italie, Saint-Marin, Côte d'Ivoire, Bénin, Gabon, Congo.
     */
    public function test_detects_a_national_trunk_prefix_after_the_country_code(): void
    {
        $this->assertTrue(PhoneNumber::hasNationalTrunkPrefix('+330612345678'));
        $this->assertTrue(PhoneNumber::hasNationalTrunkPrefix('+4407911123456'));
        $this->assertTrue(PhoneNumber::hasNationalTrunkPrefix('+2210771234567'));
        $this->assertTrue(PhoneNumber::hasNationalTrunkPrefix('+2001001234567'));
        $this->assertTrue(PhoneNumber::hasNationalTrunkPrefix('+109125550100'));

        $this->assertFalse(PhoneNumber::hasNationalTrunkPrefix('+33612345678'));
        $this->assertFalse(PhoneNumber::hasNationalTrunkPrefix('+221771234567'));
        // +220 (Gambie) : le 0 fait partie de l'INDICATIF à trois chiffres.
        $this->assertFalse(PhoneNumber::hasNationalTrunkPrefix('+2207012345'));
        // Le 0 significatif.
        $this->assertFalse(PhoneNumber::hasNationalTrunkPrefix('+390612345678'));
        $this->assertFalse(PhoneNumber::hasNationalTrunkPrefix('+3780549123456'));
        $this->assertFalse(PhoneNumber::hasNationalTrunkPrefix('+2250707123456'));
        $this->assertFalse(PhoneNumber::hasNationalTrunkPrefix('+2290197000000'));
        $this->assertFalse(PhoneNumber::hasNationalTrunkPrefix('+24106123456'));
        $this->assertFalse(PhoneNumber::hasNationalTrunkPrefix('+242061234567'));
        // Hors forme E.164 : rien à dire ici, `isValid` s'en charge.
        $this->assertFalse(PhoneNumber::hasNationalTrunkPrefix('0612345678'));
    }
}
