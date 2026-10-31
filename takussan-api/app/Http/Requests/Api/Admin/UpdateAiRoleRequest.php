<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Rules\FournisseurSelectionnable;
use App\Rules\IdentifiantDeModele;

/** TCK-2385 — la chaîne ordonnée d'un rôle : un à cinq maillons, chacun d'un fournisseur sélectionnable. */
class UpdateAiRoleRequest extends BaseFormRequest
{
    /**
     * Le geste `platform.ai.manage` et le second facteur récent sont jugés par les middlewares de
     * la route, avant toute validation ; `BaseFormRequest` refuserait sinon tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'chain' => ['required', 'array', 'min:1', 'max:5'],
            'chain.*.provider' => ['required', 'string', new FournisseurSelectionnable],
            'chain.*.model' => ['required', 'string', 'max:255', new IdentifiantDeModele],
            'chain.*.max_tokens' => ['nullable', 'integer', 'min:1', 'max:128000'],
            'override_reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
