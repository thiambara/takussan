<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 — fusionner un quartier dans un autre de la même ville. */
class GeoMergeRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['into_id' => ['required', 'integer', 'exists:geo_neighborhoods,id']];
    }
}
