<?php

namespace App\Http\Requests\Api\Commissions;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\CommissionCancelReason;
use Illuminate\Validation\Rule;

/**
 * TCK-2661 — `POST /api/commissions/{id}/cancel` : le code du motif, et un texte exigé pour `other`.
 * Le motif est lu par le bénéficiaire sur sa ligne.
 */
class CancelCommissionRequest extends BaseFormRequest
{
    use TransitionalEmptyBody;

    public const REASON_MAX = 500;

    public function authorize(): bool
    {
        return $this->user()?->can('cancel', $this->route('commissionEntry')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // TCK-2661 — transition, retiré par TCK-2662 : un corps vide n'est pas validé.
        if ($this->isTransitionalEmptyBody()) {
            return [];
        }

        return [
            'reason_code' => ['required', 'string', Rule::enum(CommissionCancelReason::class)],
            'reason' => ['nullable', 'required_if:reason_code,'.CommissionCancelReason::Other->value, 'string', 'max:'.self::REASON_MAX],
        ];
    }
}
