<?php

namespace App\Http\Requests\Geo;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 — `GET /api/public/geo/neighborhoods` : la ville est obligatoire (une liste par ville). */
class GeoNeighborhoodsRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'city' => ['required', 'integer'],
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
        ];
    }
}
