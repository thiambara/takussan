<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\BoostBadge;
use App\Models\Enums\BoostKind;
use Illuminate\Validation\Rule;

/** TCK-633 lot F (ADR-0061 §4) — une offre : genre, variante (badge seulement), durée, prix en crédits. */
class StoreBoostProductRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $bump = $this->input('kind') === BoostKind::Bump->value;
        $variant = $this->input('variant');

        return [
            'kind' => ['required', Rule::enum(BoostKind::class)],
            'variant' => [
                Rule::requiredIf($this->input('kind') === BoostKind::Badge->value),
                Rule::prohibitedIf($this->input('kind') !== BoostKind::Badge->value),
                'nullable', Rule::enum(BoostBadge::class),
            ],
            // (genre, variante, durée) est l'identité d'une offre : unique, comme la contrainte
            // `boost_products_offer_unique` (NULLS NOT DISTINCT) qui la garde en base.
            'duration_days' => [
                'required', 'integer', $bump ? 'in:0' : 'between:1,365',
                Rule::unique('boost_products')
                    ->where('kind', (string) $this->input('kind'))
                    ->where(fn ($q) => $variant === null ? $q->whereNull('variant') : $q->where('variant', $variant)),
            ],
            'price_credits' => ['required', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:1000'],
        ];
    }
}
