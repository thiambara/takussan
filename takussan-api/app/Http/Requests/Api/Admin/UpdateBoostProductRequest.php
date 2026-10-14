<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 lot F (ADR-0061 §4) — genre, variante et durée sont l'identité de l'offre : immuables. */
class UpdateBoostProductRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'kind' => ['prohibited'],
            'variant' => ['prohibited'],
            'duration_days' => ['prohibited'],
            'price_credits' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:1000'],
        ];
    }
}
