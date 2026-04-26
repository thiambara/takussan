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
}
