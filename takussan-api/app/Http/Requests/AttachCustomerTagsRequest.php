<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AttachCustomerTagsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'tags' => ['required', 'array', 'min:1'],
            'tags.*' => ['required', 'string', 'max:100'],
        ];
    }

    /** Returns normalized (lowercase, trimmed) unique tag names from the request. */
    public function normalizedNames(): array
    {
        $names = array_map(
            fn (string $n) => mb_strtolower(trim($n)),
            $this->input('tags', []),
        );

        return array_values(array_unique(array_filter($names)));
    }
}
