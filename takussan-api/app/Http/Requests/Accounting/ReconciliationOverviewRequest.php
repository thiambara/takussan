<?php

namespace App\Http\Requests\Accounting;

use App\Http\Requests\BaseFormRequest;
use App\Models\BankStatement;

/**
 * TCK-2674 — `GET …/reconciliation/overview` : le mois lu (`period=YYYY-MM`, le mois courant à
 * défaut). L'autorisation est celle du rapprochement (`BankStatementPolicy::viewAny`), jugée avant
 * la validation : un agent reçoit 403, jamais 422.
 */
class ReconciliationOverviewRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', [BankStatement::class, $this->route('agency')]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'period' => ['nullable', 'string', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
        ];
    }

    public function period(): string
    {
        return $this->validated('period') ?? now()->format('Y-m');
    }
}
