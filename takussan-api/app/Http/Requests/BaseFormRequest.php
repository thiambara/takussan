<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

abstract class BaseFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        return false;
    }

    protected function prepareForValidation(): void
    {
        $this->replace($this->normalize($this->input()));
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    private function normalize(array $input): array
    {
        foreach ($input as $key => $value) {
            if (is_array($value)) {
                $input[$key] = $this->normalize($value);

                continue;
            }

            if (is_string($value)) {
                $trimmed = trim($value);
                $input[$key] = $trimmed === '' ? null : $trimmed;
            }
        }

        return $input;
    }
}
