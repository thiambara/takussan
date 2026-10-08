<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-590 — marquer une demande traitée. Délégation à `PropertyContactLeadPolicy::handle`.
 */
class HandleContactLeadRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('handle', $this->route('lead')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
