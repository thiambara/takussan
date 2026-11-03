<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Rules\MontantIa;

/** TCK-2448 — les tarifs et l'état d'un modèle du catalogue ; seuls les champs présents changent. */
class UpdateAiModelRequest extends BaseFormRequest
{
    /** Même raison qu'`UpdateAiRoleRequest::authorize()`. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'input' => ['sometimes', 'required', new MontantIa],
            'output' => ['sometimes', 'required', new MontantIa],
            'cache_read' => ['sometimes', 'required', new MontantIa],
            'cache_write' => ['sometimes', 'required', new MontantIa],
            'active' => ['sometimes', 'boolean'],
        ];
    }
}
