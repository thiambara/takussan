<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-598 (V14, contrainte 12) — `GET /api/public/properties/neighborhoods?city=…`.
 *
 * `city` est REQUIS : le domaine des quartiers se borne par ville. Sans elle, l'endpoint
 * énumérerait tous les quartiers du catalogue, et un même nom (« Médina ») de deux villes se
 * fondrait en une entrée.
 */
class NeighborhoodsPublicPropertyRequest extends BaseFormRequest
{
    /** Route publique : rien à autoriser, le périmètre est le catalogue publié. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'city' => ['required', 'string', 'max:255'],
        ];
    }

    public function city(): string
    {
        return trim((string) $this->validated('city'));
    }
}
