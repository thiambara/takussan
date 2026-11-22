<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2627 — `GET /api/me/exports` : 10 par défaut, 50 au plus. Ce que l'appelant lit est le sien
 * seul (borné par le contrôleur) : aucune autorisation à porter ici.
 */
class ListMeExportsRequest extends BaseFormRequest
{
    public const DEFAULT_LIMIT = 10;

    public const MAX_LIMIT = 50;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'limit' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_LIMIT],
        ];
    }

    public function limit(): int
    {
        return (int) ($this->validated('limit') ?? self::DEFAULT_LIMIT);
    }
}
