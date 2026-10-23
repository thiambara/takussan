<?php

namespace App\Http\Requests\Accounting;

use App\Http\Requests\BaseFormRequest;
use App\Models\BankStatement;

/**
 * TCK-1864 (P188.06) — la recherche manuelle de paiements du rapprochement.
 *
 * `q` et `direction` étaient lus sans règle : en liste, `q` faisait lever `TypeError` sur
 * `PaymentSearchService::search(string $query)` et `direction` « Array to string conversion »,
 * deux 500. Seule la forme est jugée ici : une direction inconnue reste ignorée par `tryFrom()`, et
 * `amount` reste lu par `$request->float()`, pour ne refuser aucun appel qui rend 200 aujourd'hui.
 */
class SearchPaymentsRequest extends BaseFormRequest
{
    /** La policy que le contrôleur juge, invoquée avant la validation (TCK-818). */
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', [BankStatement::class, $this->route('agency')]) === true;
    }

    public function rules(): array
    {
        return [
            'q' => ['nullable', 'string'],
            'direction' => ['nullable', 'string'],
        ];
    }
}
