<?php

namespace Tests\Unit\Rules;

use App\Rules\StrongPasswordRule;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class StrongPasswordRuleTest extends TestCase
{
    public function test_accepts_compliant_password(): void
    {
        $validator = Validator::make(
            ['password' => 'Str0ng!Pass'],
            ['password' => [new StrongPasswordRule]],
        );

        $this->assertTrue($validator->passes());
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function weakPasswords(): array
    {
        return [
            'too short' => ['Ab1!'],
            'no uppercase' => ['str0ng!pass'],
            'no lowercase' => ['STR0NG!PASS'],
            'no digit' => ['StrongPass!'],
            'no special' => ['Str0ngPass9'],
        ];
    }

    #[DataProvider('weakPasswords')]
    public function test_rejects_weak_passwords(string $password): void
    {
        $validator = Validator::make(
            ['password' => $password],
            ['password' => [new StrongPasswordRule]],
        );

        $this->assertTrue($validator->fails(), "Expected `{$password}` to be rejected");
    }

    public function test_rejects_non_string_values(): void
    {
        $validator = Validator::make(
            ['password' => 12345678],
            ['password' => [new StrongPasswordRule]],
        );

        $this->assertTrue($validator->fails());
    }
}
