<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-590 — convertir une demande en fiche client. Délégation à
 * `PropertyContactLeadPolicy::convert`, avant la validation. Rien à valider : la fiche se construit
 * depuis la demande.
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
        return [];
    }
}
