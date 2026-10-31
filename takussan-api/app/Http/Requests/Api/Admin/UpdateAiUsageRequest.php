<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Rules\MontantIa;
use Illuminate\Validation\Rule;

/** TCK-2385 — les réglages d'un usage ; seuls les champs présents changent. */
class UpdateAiUsageRequest extends BaseFormRequest
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
            'enabled' => ['sometimes', 'boolean'],
            // Pas de `sometimes` ici : il désactiverait `required_with` quand la clé est absente, et
            // `{forced_model: "x"}` seul passerait.
            'forced_provider' => ['nullable', 'required_with:forced_model', 'string', Rule::in(array_keys(config('ai.providers')))],
            'forced_model' => ['nullable', 'required_with:forced_provider', 'string', 'max:255'],
            'daily_budget_usd' => ['sometimes', 'nullable', new MontantIa],
        ];
    }
}
