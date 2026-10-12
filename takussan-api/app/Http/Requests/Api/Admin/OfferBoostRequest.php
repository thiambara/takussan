<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 lot F (ADR-0061 §5) — offrir une Vedette : l'offre (sa durée), et le motif. */
class OfferBoostRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'product_id' => ['required', 'integer', 'exists:boost_products,id'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }
}
