<?php

namespace App\Http\Requests;

/**
 * TCK-596 §4B (ADR-0042 §6) — `POST /api/leases/{lease}/activate`, la voie papier : le contrat
 * signé hors plateforme, numérisé, est obligatoire. L'autorisation (`update`) est jugée AVANT la
 * validation : un tiers reçoit 403, pas la liste des champs attendus.
 */
class ActivateLeaseRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('lease')) === true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'contract' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ];
    }
}
