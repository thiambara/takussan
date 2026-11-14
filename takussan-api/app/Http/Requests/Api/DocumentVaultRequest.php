<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Services\Documents\DocumentVault;

/**
 * TCK-2769 — `GET /api/me/document-vault` : `filter[search]` (au plus 100 caractères), `page` et
 * `per_page` (au plus 50), qui ne servent que sous la recherche.
 *
 * `authorize()` rend vrai : la route est authentifiée, et le coffre ne juge qu'entrée par entrée, par la
 * règle de l'endpoint qui sert chacune ({@see DocumentVault}) ; le contrôleur
 * n'autorisait rien avant de valider.
 */
class DocumentVaultRequest extends BaseFormRequest
{
    public const MAX_PER_PAGE = 50;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter' => ['nullable', 'array'],
            'filter.search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ];
    }

    /** La recherche, ou `null` sans elle (une chaîne vide arrive déjà `null`). */
    public function recherche(): ?string
    {
        $q = data_get($this->validated('filter'), 'search');

        return is_string($q) && trim($q) !== '' ? trim($q) : null;
    }

    public function page(): int
    {
        return (int) ($this->validated('page') ?? 1);
    }

    public function pageSize(): int
    {
        return (int) ($this->validated('per_page') ?? 20);
    }
}
