<?php

namespace App\Http\Requests\Search;

use App\Models\Enums\DocumentType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
            // TCK-1071 (P62.05) — pas d'`exists:conversations,id` : un fil absent rendait 422, un fil
            // tiers une page vide. Le service borne la recherche aux fils de l'appelant, et rend la
            // même page vide aux deux.
            'filter.conversation' => ['nullable', 'integer'],
            'filter.type' => ['nullable', Rule::enum(DocumentType::class)],
            'filter.date_from' => ['nullable', 'date'],
            'filter.date_to' => ['nullable', 'date', 'after_or_equal:filter.date_from'],
            'sort' => ['nullable', 'string', 'in:relevance,-created_at'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ];
    }
}
