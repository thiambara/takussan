<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class StrongPasswordRule implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)
            || mb_strlen($value) < 8
            || ! preg_match('/[A-Z]/u', $value)
            || ! preg_match('/[a-z]/u', $value)
            || ! preg_match('/\d/u', $value)
            || ! preg_match('/[^A-Za-z0-9]/u', $value)
        ) {
            $fail(__('validation.rules.strong_password'));
        }
    }
}
