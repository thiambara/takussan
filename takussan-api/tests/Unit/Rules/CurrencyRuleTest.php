<?php

namespace Tests\Unit\Rules;

use App\Rules\CurrencyRule;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

class CurrencyRuleTest extends TestCase
{
    public function test_accepts_whitelisted_currencies(): void
    {
        foreach (['XOF', 'EUR', 'USD', 'xof', 'eur'] as $currency) {
            $validator = Validator::make(['currency' => $currency], ['currency' => [new CurrencyRule]]);
            $this->assertTrue($validator->passes(), "Expected `{$currency}` to pass");
        }
    }

    public function test_rejects_unknown_currencies(): void
    {
        foreach (['GBP', 'CAD', 'XXX', 'xyz'] as $currency) {
            $validator = Validator::make(['currency' => $currency], ['currency' => [new CurrencyRule]]);
            $this->assertTrue($validator->fails(), "Expected `{$currency}` to be rejected");
        }
    }
}
