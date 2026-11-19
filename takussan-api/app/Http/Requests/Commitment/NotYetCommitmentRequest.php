<?php

namespace App\Http\Requests\Commitment;

use App\Http\Requests\BaseFormRequest;
use App\Models\Commitment;
use App\Policies\CommitmentPolicy;

/**
 * TCK-2970 (ADR-0130 §§ 3 et 4) — `POST /api/commitments/{commitment}/not-yet` : le bénéficiaire répond « Pas encore » à la
 * question « Tenu ? ». Aucun corps.
 *
 * La politique est appelée DIRECTEMENT (jamais par `can()`, que le super-admin passerait).
 */
class NotYetCommitmentRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $engagement = $this->route('commitment');

        return $this->user() !== null
            && $engagement instanceof Commitment
            && app(CommitmentPolicy::class)->notYet($this->user(), $engagement);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
