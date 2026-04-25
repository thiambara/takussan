<?php

namespace App\Http\Requests;

/**
 * TCK-090 — `POST /api/leases/{lease}/early-termination` payload validator.
 *
 * Notice-period and end-date guards are enforced inside
 * `EarlyTerminationService::request` so direct service callers (admin
 * commands, tests) get the same protection as the HTTP layer. This request
 * only validates payload shape.
 */
class RequestEarlyTerminationRequest extends BaseFormRequest
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
            'effective_date' => ['required', 'date', 'after:today'],
            'reason' => ['nullable', 'string', 'max:2000'],
            // The role recorded in the activity log: `tenant`, `agent`,
            // `landlord`, `agency_admin`, `admin`. Free-form so policy
            // changes don't require a migration; the API authorizes via
            // permission, not via this payload.
            'requested_by_role' => ['nullable', 'string', 'max:50'],
        ];
    }
}
