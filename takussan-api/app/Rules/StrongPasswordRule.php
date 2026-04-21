<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class StrongPasswordRule implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)
            || strlen($value) < 8
            || ! preg_match('/[A-Z]/', $value)
            || ! preg_match('/[a-z]/', $value)
            || ! preg_match('/\d/', $value)
            || ! preg_match('/[^A-Za-z0-9]/', $value)
        ) {
            $fail(__('validation.custom.strong_password'));
        }
    }
}
