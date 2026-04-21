<?php

namespace Tests\Unit\Rules;

use App\Rules\PhoneRule;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PhoneRuleTest extends TestCase
{
    /**
     * @return array<string, array{0: string}>
     */
    public static function validNumbers(): array
    {
        return [
            '+221 format' => ['+221771234567'],
            '00221 format' => ['00221781234567'],
            'local 77' => ['771234567'],
            'local 78' => ['781234567'],
            'local 76' => ['761234567'],
            'local 75' => ['751234567'],
            'local 70' => ['701234567'],
            'with spaces' => ['+221 77 123 45 67'],
        ];
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function invalidNumbers(): array
    {
        return [
            'alpha' => ['abcdefghij'],
            'too short' => ['77123456'],
            'too long' => ['7712345678'],
            'wrong prefix 79' => ['791234567'],
            'wrong country code' => ['+33771234567'],
        ];
    }

    #[DataProvider('validNumbers')]
    public function test_accepts_valid_senegalese_numbers(string $input): void
    {
        $validator = Validator::make(['phone' => $input], ['phone' => [new PhoneRule]]);

        $this->assertTrue($validator->passes(), "Expected `{$input}` to be valid");
    }

    #[DataProvider('invalidNumbers')]
    public function test_rejects_invalid_numbers(string $input): void
    {
        $validator = Validator::make(['phone' => $input], ['phone' => [new PhoneRule]]);

        $this->assertTrue($validator->fails());
    }
}
