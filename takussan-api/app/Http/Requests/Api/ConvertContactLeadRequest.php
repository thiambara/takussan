<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-590 — convertir une demande en fiche client. Délégation à
 * `PropertyContactLeadPolicy::convert`, avant la validation. La fiche se construit depuis la
 * demande ; seul `allow_duplicate` se reçoit, comme à la création (TCK-1343).
 */
class ConvertContactLeadRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('convert', $this->route('lead')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'allow_duplicate' => ['sometimes', 'boolean'],
        ];
    }
}
