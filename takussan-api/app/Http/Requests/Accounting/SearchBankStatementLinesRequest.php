<?php

namespace App\Http\Requests\Accounting;

use App\Http\Requests\BaseFormRequest;
use App\Models\BankStatement;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use Illuminate\Validation\Rule;

/**
 * TCK-2674 — `GET /api/agencies/{agency}/bank-statement-lines` : la ligne d'un paiement, cherchée
 * dans les relevés ouverts de l'agence. `filter[amount]` au franc près (la tolérance du matcher et
 * de `payment-search`), `filter[date_from]` / `filter[date_to]` sur la date comptable, bornes
 * comprises.
 */
class SearchBankStatementLinesRequest extends BaseFormRequest
{
    public const MAX_PER_PAGE = 100;

    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', [BankStatement::class, $this->route('agency')]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter' => ['nullable', 'array'],
            'filter.match_status' => ['nullable', Rule::enum(BankStatementLineMatchStatus::class)],
            'filter.direction' => ['nullable', Rule::enum(BankStatementLineDirection::class)],
            'filter.amount' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'filter.date_from' => ['nullable', 'date_format:Y-m-d'],
            // `after_or_equal` lit la borne de départ telle quelle : une liste (`filter[date_from][]=`)
            // y lève une TypeError (500). La comparaison ne se déclare que sur une chaîne — la liste,
            // elle, rend 422 par `date_format` (ADR-0075 § 3).
            'filter.date_to' => array_values(array_filter([
                'nullable', 'date_format:Y-m-d',
                is_string(data_get($this->input('filter'), 'date_from')) ? 'after_or_equal:filter.date_from' : null,
            ])),
            'sort' => ['nullable', Rule::in(['posted_at', '-posted_at', 'amount', '-amount', 'id', '-id'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ];
    }
}
