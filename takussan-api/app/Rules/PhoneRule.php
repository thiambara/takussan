<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class PhoneRule implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            $fail(__('validation.custom.phone'));

            return;
        }

        $compact = preg_replace('/\s+/', '', $value);

        if (! preg_match('/^(?:\+221|00221)?(7[05678])\d{7}$/', (string) $compact)) {
            $fail(__('validation.custom.phone'));
        }
    }
}
