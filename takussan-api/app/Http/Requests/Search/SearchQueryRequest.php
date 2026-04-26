<?php

namespace App\Http\Requests\Search;

use Illuminate\Foundation\Http\FormRequest;

class SearchQueryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'q' => ['required', 'string', 'min:2', 'max:200'],
            'filter.conversation' => ['nullable', 'integer', 'exists:conversations,id'],
            'filter.type' => ['nullable', 'string'],
            'filter.date_from' => ['nullable', 'date'],
            'filter.date_to' => ['nullable', 'date', 'after_or_equal:filter.date_from'],
            'sort' => ['nullable', 'string', 'in:relevance,-created_at'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ];
    }
}
