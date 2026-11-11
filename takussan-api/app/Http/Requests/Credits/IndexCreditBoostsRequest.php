<?php

namespace App\Http\Requests\Credits;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2663 — `GET /api/credits/boosts` : `filter[status]=active|ended` (par défaut : ce qui court,
 * et ce qui s'est terminé depuis 30 jours), `filter[id]`, `per_page`.
 */
class IndexCreditBoostsRequest extends BaseFormRequest
{
    use AuthorizesWalletReading;

    public const STATUSES = ['active', 'ended'];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter' => ['sometimes', 'array'],
            'filter.status' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', self::STATUSES)],
            'filter.id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ];
    }
}
