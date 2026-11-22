<?php

namespace App\Http\Requests\Credits;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2924 — `GET /api/credits/boosts/report?days=7|30|90` (défaut 30) : toute autre période → 422.
 * Même autorisation que `GET /api/credits`, jugée avant la validation.
 */
class CreditBoostReportRequest extends BaseFormRequest
{
    use AuthorizesWalletReading;

    public const PERIODS = [7, 30, 90];

    public const DEFAULT_DAYS = 30;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'days' => ['sometimes', 'integer', 'in:'.implode(',', self::PERIODS)],
        ];
    }
}
