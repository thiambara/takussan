<?php

namespace App\Http\Requests\Credits;

use App\Http\Requests\BaseFormRequest;
use App\Models\Property;
use App\Models\PropertyBoost;

/** TCK-633 lot F (ADR-0061 §5) — booster un bien : la règle vit dans `PropertyBoostPolicy::create`. */
class StorePropertyBoostRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $property = $this->route('property');

        return $property instanceof Property
            && $this->user()?->can('create', [PropertyBoost::class, $property]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'product_id' => ['required', 'integer', 'exists:boost_products,id'],
        ];
    }
}
