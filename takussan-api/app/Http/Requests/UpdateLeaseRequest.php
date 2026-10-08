<?php

namespace App\Http\Requests;

use App\Models\Lease;
use App\Rules\PersonnelDeLAgence;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\ValidationException;

/**
 * TCK-087 — `PATCH /api/leases/{lease}` payload validator.
 *
 * Editable here: the late-fee config, the early-termination and rent-review terms frozen
 * with the contract (VERIF-596 N1), and, since TCK-595 (ADR-0049), the negotiator
 * (`agent_id`) and the agency commission (`commission_amount`);
 * lifecycle changes (status, dates, monthly_rent…) flow through their
 * dedicated actions on `LeaseController` (activate, terminate, renew) or
 * dedicated endpoints (`PATCH /leases/{lease}/rent` for rent reviews —
 * TCK-091).
 */
class UpdateLeaseRequest extends BaseFormRequest
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
            'late_fee_percent' => ['sometimes', 'nullable', 'numeric', 'between:0,50'],
            'late_fee_grace_days' => ['sometimes', 'nullable', 'integer', 'between:0,30'],
            // VERIF-596 passe 2 (N1) — termes imprimés et figés avec le contrat : modifiables tant
            // que le bail n'est pas signé, refusés ensuite (`lease.terms_locked`).
            'early_termination_penalty_months' => ['sometimes', 'nullable', 'integer', 'between:0,12'],
            'rent_review_max_pct' => ['sometimes', 'nullable', 'numeric', 'between:0,100'],
            // TCK-595 (ADR-0049 §1, §2) — modifiables, mais le grand livre est figé à l'activation : une
            // correction après coup ne régénère aucune ligne, l'admin annule la ligne fausse.
            'commission_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'agent_id' => ['sometimes', 'nullable', 'integer', new PersonnelDeLAgence($this->leaseAgencyId())],
        ];
    }

    /**
     * TCK-091 — Reject `monthly_rent` (and `sale_price`) in the generic
     * PATCH payload so every rent change flows through the dedicated
     * rent-review endpoint (which enforces variation guards, journals
     * the change in the activity log, and notifies the tenant). The
     * error is reported on the actual offending key(s) so the frontend
     * can highlight the right field.
     */
    protected function passedValidation(): void
    {
        $offending = [];
        foreach (['monthly_rent', 'sale_price'] as $key) {
            if ($this->has($key)) {
                $offending[$key] = [__('messages.lease_rent_use_dedicated_endpoint')];
            }
        }

        if ($offending !== []) {
            throw ValidationException::withMessages($offending)->status(422);
        }
    }

    /**
     * @return array<string,string>
     */
    public function messages(): array
    {
        return [];
    }

    /** TCK-595 — l'agence DU BIEN du bail, celle dont le négociateur doit être le personnel. */
    private function leaseAgencyId(): ?int
    {
        $lease = $this->route('lease');
        $agencyId = $lease instanceof Lease ? $lease->property()->value('agency_id') : null;

        return $agencyId !== null ? (int) $agencyId : null;
    }

    public function withValidator(Validator $validator): void
    {
        // No additional cross-field rules for now — keeping the hook so
        // future custom rules don't change the public signature.
    }
}
