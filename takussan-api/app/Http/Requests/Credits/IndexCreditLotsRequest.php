<?php

namespace App\Http\Requests\Credits;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2924 — `GET /api/credits/lots` : les lots épuisés ou expirés de l'espace actif,
 * `filter[state]=spent|expired` (absent : les deux), `fields[credit_lots]`, `per_page` (1 à 50).
 * Même autorisation que `GET /api/credits`, jugée avant la validation.
 */
class IndexCreditLotsRequest extends BaseFormRequest
{
    use AuthorizesWalletReading;

    public const STATES = ['spent', 'expired'];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter' => ['sometimes', 'array'],
            'filter.state' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', self::STATES)],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ];
    }
}
