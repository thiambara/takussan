<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class CurrencyRule implements ValidationRule
{
    public const ALLOWED = ['XOF', 'EUR', 'USD'];

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! in_array(strtoupper($value), self::ALLOWED, true)) {
            $fail(__('validation.rules.currency', ['allowed' => implode(', ', self::ALLOWED)]));
        }
    }
}
