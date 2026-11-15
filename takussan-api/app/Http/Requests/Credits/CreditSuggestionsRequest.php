<?php

namespace App\Http\Requests\Credits;

use App\Http\Requests\BaseFormRequest;

/** TCK-2663 — `GET /api/credits/suggestions?limit=N` : au plus dix biens à pousser. */
class CreditSuggestionsRequest extends BaseFormRequest
{
    use AuthorizesWalletReading;

    public const LIMIT_MAX = 10;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'limit' => ['sometimes', 'integer', 'min:1', 'max:'.self::LIMIT_MAX],
        ];
    }
}
