<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2413 — délier l'annonceur de son compte supprimé : un motif facultatif, écrit au journal. Un texte d'opérateur, qu'il lui
 * appartient de garder sans numéro. Gardée par `super-admin` + `platform-can:platform.radar.publish` sur la route : le compte
 * délié est celui que « Publier pour lui » avait créé.
 */
class ReleaseRadarAdvertiserAccountRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['reason' => ['nullable', 'string', 'max:500']];
    }

    public function reason(): ?string
    {
        $reason = $this->validated('reason');

        return is_string($reason) ? $reason : null;
    }
}
