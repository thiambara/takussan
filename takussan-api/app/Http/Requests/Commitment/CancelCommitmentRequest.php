<?php

namespace App\Http\Requests\Commitment;

use App\Http\Requests\BaseFormRequest;
use App\Models\Commitment;
use App\Policies\CommitmentPolicy;

/**
 * TCK-2969 (ADR-0130 § 2) — `POST /api/commitments/{commitment}/cancel` : qui l'a noté, ou le personnel.
 * Aucun corps. La politique est appelée DIRECTEMENT (jamais par `can()`, que le super-admin passerait).
 */
class CancelCommitmentRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $engagement = $this->route('commitment');

        return $this->user() !== null
            && $engagement instanceof Commitment
            && app(CommitmentPolicy::class)->cancel($this->user(), $engagement);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
