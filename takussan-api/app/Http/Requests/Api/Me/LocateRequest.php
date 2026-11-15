<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Services\Profiles\OuEstLaFiche;
use Illuminate\Validation\Rule;

/**
 * TCK-2847 (ADR-0116 § 1) — `GET /api/me/locate?type=…&id=…`. `type` est la liste fermée de
 * {@see OuEstLaFiche::TYPES}, `id` un entier positif borné : une valeur en liste (`type[]=`) ou un
 * identifiant hors de `bigint` rend 422, jamais une 500.
 */
class LocateRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'type' => ['required', 'string', Rule::in(array_keys(OuEstLaFiche::TYPES))],
            'id' => ['required', 'string', 'regex:/^[1-9][0-9]{0,17}$/'],
        ];
    }

    public function type(): string
    {
        return (string) $this->validated('type');
    }

    public function identifiant(): int
    {
        return (int) $this->validated('id');
    }
}
