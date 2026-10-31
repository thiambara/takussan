<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\AiModelRole;
use Illuminate\Validation\Rule;

/** TCK-2385 — le candidat à évaluer pour un rôle. */
class StoreAiEvaluationRequest extends BaseFormRequest
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
            'role' => ['required', Rule::enum(AiModelRole::class)],
            'provider' => ['required', 'string', Rule::in(array_keys(config('ai.providers')))],
            'model' => ['required', 'string', 'max:255'],
            'max_tokens' => ['nullable', 'integer', 'min:1', 'max:128000'],
        ];
    }
}
