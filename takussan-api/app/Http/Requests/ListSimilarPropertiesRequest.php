<?php

namespace App\Http\Requests;

class ListSimilarPropertiesRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'limit' => ['nullable', 'integer', 'min:1', 'max:12'],
        ];
    }

    public function limit(): int
    {
        return (int) ($this->validated('limit') ?? 6);
    }
}
