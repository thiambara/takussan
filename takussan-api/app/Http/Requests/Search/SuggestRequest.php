<?php

namespace App\Http\Requests\Search;

use Illuminate\Foundation\Http\FormRequest;

class SuggestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'q' => ['nullable', 'string', 'max:50'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:30'],
        ];
    }

    public function q(): string
    {
        return (string) ($this->validated()['q'] ?? '');
    }

    public function limit(): int
    {
        return (int) ($this->validated()['limit'] ?? 10);
    }
}
