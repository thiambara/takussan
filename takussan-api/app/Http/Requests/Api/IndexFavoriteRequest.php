<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-599 §1 — la liste des favoris : `per_page` était passé tel quel à `paginate()`.
 *
 * TCK-2625 — `filter[price_changed]=1` : les seuls favoris dont le prix a bougé depuis l'ajout (« vos
 * favoris qui bougent », accueil du client). Liste blanche FERMÉE (`array:price_changed`) : un filtre
 * inconnu rend 422, jamais une liste non filtrée qu'on croirait filtrée.
 */
class IndexFavoriteRequest extends BaseFormRequest
{
    public const MAX_PER_PAGE = 50;

    /** La liste ne lit que les favoris de l'appelant : rien à autoriser avant de valider. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
            'filter' => ['sometimes', 'array:price_changed'],
            'filter.price_changed' => ['sometimes', 'boolean'],
        ];
    }
}
