<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Rules\IdentifiantDeModele;
use App\Rules\MontantIa;
use Illuminate\Validation\Rule;

/**
 * TCK-2448 (ADR-0085 §1) — un modèle d'un fournisseur déclaré et ses quatre tarifs, tous exigés : un
 * tarif nul se saisit, un tarif absent est refusé. `active` faux retire un modèle de la configuration.
 */
class StoreAiModelRequest extends BaseFormRequest
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
            'provider' => ['required', 'string', Rule::in(array_keys(config('ai.providers')))],
            'model' => ['required', 'string', 'max:255', new IdentifiantDeModele, Rule::unique('ai_models', 'model')->where('provider', $this->input('provider'))],
            'input' => ['required', new MontantIa],
            'output' => ['required', new MontantIa],
            'cache_read' => ['required', new MontantIa],
            'cache_write' => ['required', new MontantIa],
            'active' => ['sometimes', 'boolean'],
        ];
    }
}
