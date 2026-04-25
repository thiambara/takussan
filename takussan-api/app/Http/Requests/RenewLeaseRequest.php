<?php

namespace App\Http\Requests;

/**
 * TCK-089 — Validation du payload `POST /api/leases/{lease}/renew`.
 *
 * `tenant_id` et `property_id` sont strictement immuables — ils sont
 * marqués `prohibited` (422 si présents). Le reste est `sometimes`
 * pour permettre l'héritage du parent.
 *
 * NB : la chronologie effective (start_date/end_date après héritage du
 * parent) est validée côté service — la règle `after:start_date` ici ne
 * s'applique qu'au payload entrant et ne couvre pas le cas où seul
 * end_date est fourni (start_date est alors hérité de parent.end_date+1).
 */
class RenewLeaseRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'start_date' => ['sometimes', 'nullable', 'date'],
            'end_date' => ['sometimes', 'nullable', 'date', 'after:start_date'],
            'monthly_rent' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'deposit_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'commission_rate' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'late_fee_percent' => ['sometimes', 'nullable', 'numeric', 'between:0,50'],
            'late_fee_grace_days' => ['sometimes', 'nullable', 'integer', 'between:0,30'],
            'terms' => ['sometimes', 'nullable', 'string'],
            'special_conditions' => ['sometimes', 'nullable', 'string'],
            // Immutables côté avenant — pour changer de locataire / bien
            // il faut créer un nouveau bail racine.
            'tenant_id' => ['prohibited'],
            'property_id' => ['prohibited'],
            'landlord_id' => ['prohibited'],
        ];
    }
}
