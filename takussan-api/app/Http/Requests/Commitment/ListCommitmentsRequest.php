<?php

namespace App\Http\Requests\Commitment;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2987 (ADR-0130 § 6) — `GET /api/commitments` : les engagements du lecteur, dans les fils qu'il lit.
 * Tout compte authentifié lit SES engagements ; les fils sont restreints par la route
 * (`ConversationAccess::participatingQuery`).
 *
 * `filter[role]` et `filter[etat]` sont des chaînes libres : une valeur hors liste ne rend rien (règle des
 * valeurs en liste, ADR-0075), jamais un 422 ni une valeur appelée sur un modèle.
 */
class ListCommitmentsRequest extends BaseFormRequest
{
    public const ROLES = ['owed', 'mine'];

    public const ETATS = ['late', 'open', 'proposed', 'kept', 'cancelled'];

    public const PAR_PAGE_MAX = 50;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter' => ['nullable', 'array'],
            'filter.role' => ['nullable', 'string', 'max:40'],
            'filter.etat' => ['nullable', 'string', 'max:40'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::PAR_PAGE_MAX],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
