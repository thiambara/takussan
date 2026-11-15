<?php

namespace App\Http\Requests\Accounting;

use App\Http\Requests\BaseFormRequest;
use App\Models\BankStatement;

/**
 * TCK-2674 — `POST /api/agencies/{agency}/bank-statement-lines/confirm-batch` : au plus 200 lignes
 * proposées, confirmées par le geste unitaire `match`. Que chaque ligne soit une ligne proposée d'un
 * relevé ouvert de l'agence se juge sous verrou (`ReconciliationManager::confirmSuggestedBatch`).
 */
class ConfirmBankStatementLinesBatchRequest extends BaseFormRequest
{
    public const MAX_LINES = 200;

    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', [BankStatement::class, $this->route('agency')]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'line_ids' => ['required', 'array', 'min:1', 'max:'.self::MAX_LINES],
            'line_ids.*' => ['required', 'integer', 'min:1', 'max:9223372036854775807', 'distinct'],
        ];
    }
}
