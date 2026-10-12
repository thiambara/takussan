<?php

namespace App\Http\Requests\Geo;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 — `GET /api/public/geo/cities` : lecture publique. */
class GeoCitiesRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'region' => ['sometimes', 'nullable', 'integer'],
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
        ];
    }
}
