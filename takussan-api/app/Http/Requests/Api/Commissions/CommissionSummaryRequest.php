<?php

namespace App\Http\Requests\Api\Commissions;

use App\Http\Requests\BaseFormRequest;
use App\Models\CommissionEntry;

/**
 * TCK-2661 — `GET /api/commissions/summary?year=YYYY&month=YYYY-MM`. Hors personnel, 403 avant la
 * validation (`CommissionEntryPolicy::viewAny`) ; le périmètre des lignes (l'agent ne lit que lui)
 * est celui du relevé, `CommissionEntry::scopeVisibleTo`.
 */
class CommissionSummaryRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', CommissionEntry::class) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // `date_format:Y` lit « 26 » comme l'an 26 : quatre chiffres exigés.
            'year' => ['nullable', 'string', 'regex:/^\d{4}$/'],
            'month' => ['nullable', 'date_format:Y-m'],
        ];
    }
}
