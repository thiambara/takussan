<?php

namespace App\Http\Requests\Commitment;

use App\Http\Requests\BaseFormRequest;
use App\Models\Commitment;
use App\Policies\CommitmentPolicy;
use App\Rules\InstantIso;

/**
 * TCK-2969 (ADR-0130 § 2) — `POST /api/commitments/{commitment}/confirm` `{due_at?}` : le porteur confirme
 * l'engagement noté pour lui, avec l'échéance notée ou une autre.
 *
 * La politique est appelée DIRECTEMENT (le `Gate::before` du super-admin l'accepterait par `can()`).
 */
class ConfirmCommitmentRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $engagement = $this->route('commitment');

        return $this->user() !== null
            && $engagement instanceof Commitment
            && app(CommitmentPolicy::class)->confirm($this->user(), $engagement);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'due_at' => ['nullable', 'date', new InstantIso],
        ];
    }
}
