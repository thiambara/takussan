<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 — fusionner un équipement proposé dans un autre. */
class TagMergeRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['into_id' => ['required', 'integer', 'exists:tags,id']];
    }
}
