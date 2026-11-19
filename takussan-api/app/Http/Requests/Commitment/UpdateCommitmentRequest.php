<?php

namespace App\Http\Requests\Commitment;

use App\Http\Requests\BaseFormRequest;
use App\Models\Commitment;
use App\Policies\CommitmentPolicy;
use App\Rules\InstantIso;

/**
 * TCK-2970 (ADR-0130 §§ 3 et 4) — `PUT /api/commitments/{commitment}` `{title?, due_at?}` : le porteur ou le personnel
 * renomme l'engagement, ou le reporte à une nouvelle échéance.
 *
 * La politique est appelée DIRECTEMENT (jamais par `can()`, que le super-admin passerait).
 */
class UpdateCommitmentRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $engagement = $this->route('commitment');

        return $this->user() !== null
            && $engagement instanceof Commitment
            && app(CommitmentPolicy::class)->update($this->user(), $engagement);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'required', 'string', 'max:'.StoreCommitmentRequest::TITRE_MAX],
            'due_at' => ['sometimes', 'required', 'date', new InstantIso],
        ];
    }
}
