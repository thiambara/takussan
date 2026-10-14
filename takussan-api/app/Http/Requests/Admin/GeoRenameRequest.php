<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 — renommer un quartier proposé (console super-admin). */
class GeoRenameRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['name' => ['required', 'string', 'max:120']];
    }
}
