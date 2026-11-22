<?php

namespace App\Http\Requests\Accounting;

/**
 * TCK-2932 — `GET …/reconciliation/ignored-payments` : les paiements ignorés de l'agence, ceux payés
 * dans le mois `period` (`YYYY-MM`) si elle est donnée, sinon tous ; `per_page` au plus 100.
 */
class ReconciliationIgnoredPaymentsRequest extends ReconciliationOverviewRequest
{
    public const MAX_PER_PAGE = 100;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return parent::rules() + [
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ];
    }

    /** Le mois demandé, `null` sans `period` (contrairement à la synthèse, pas de mois courant à défaut). */
    public function periodOrNull(): ?string
    {
        return $this->validated('period');
    }

    public function pageSize(): int
    {
        return (int) ($this->validated('per_page') ?? 20);
    }
}
