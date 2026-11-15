<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2764 — `DELETE /api/leases/{lease}` : abandonner un brouillon jamais envoyé en signature.
 *
 * L'autorisation court ici, avant la validation (un appel non autorisé et mal formé rend 403, jamais
 * 422) ; simple délégation à `LeasePolicy::update` — et non à `abandon`, qui ajoute la condition
 * `draft` pour l'écran : un bail qui n'est plus un brouillon rend 422 `lease.not_draft_abandon`, jugé
 * sous verrou par `LeaseService::abandonDraft()` avec les échéances, et non 403.
 */
class AbandonLeaseDraftRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('lease')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
