<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Services\Crm\CustomerTimeline;

/**
 * TCK-2589 — `GET /api/customers/{customer}/timeline` : le fil de la fiche. Délégation à
 * `CustomerPolicy::view`, avant la validation — exactement la lecture de la fiche.
 * `filter[type]` est une liste à virgules de {@see CustomerTimeline::TYPES}.
 */
class CustomerTimelineRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('view', $this->route('customer')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $type = '(?:'.implode('|', CustomerTimeline::TYPES).')';

        return [
            'filter' => ['sometimes', 'array'],
            'filter.type' => ['sometimes', 'nullable', 'string', 'regex:/^'.$type.'(?:,'.$type.')*$/'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    /** @return list<string> */
    public function types(): array
    {
        $raw = $this->input('filter.type');

        return is_string($raw) && $raw !== '' ? array_values(array_unique(explode(',', $raw))) : [];
    }
}
