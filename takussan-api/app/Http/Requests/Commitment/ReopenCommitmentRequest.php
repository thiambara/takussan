<?php

namespace App\Http\Requests\Commitment;

use App\Http\Requests\BaseFormRequest;
use App\Models\Commitment;
use App\Policies\CommitmentPolicy;

/**
 * TCK-2970 (ADR-0130 §§ 3 et 4) — `POST /api/commitments/{commitment}/reopen` `{reason}` : l'autre partie (une fois, droit
 * partagé) ou le personnel (toujours) rouvre un engagement déclaré tenu, avec un motif.
 *
 * La politique est appelée DIRECTEMENT (jamais par `can()`, que le super-admin passerait).
 */
class ReopenCommitmentRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $engagement = $this->route('commitment');

        return $this->user() !== null
            && $engagement instanceof Commitment
            && app(CommitmentPolicy::class)->reopen($this->user(), $engagement);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ];
    }
}
