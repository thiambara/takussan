<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-595 (§6) — `period` = un mois `Y-m`, le mois courant par défaut.
 *
 * L'autorisation reste au contrôleur (`AgencyPolicy::viewReports`), comme pour toute FormRequest de
 * ce dépôt (TCK-306).
 */
class ShowTeamPerformanceRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'period' => ['sometimes', 'string', 'date_format:Y-m'],
        ];
    }
}
