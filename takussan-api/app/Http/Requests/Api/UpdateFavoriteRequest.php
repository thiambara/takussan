<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-599 §1 — la note personnelle d'un favori (`PATCH /api/favorites/{property}`).
 *
 * L'appartenance ne se juge PAS ici : le contrôleur cherche le favori de l'appelant et rend 404
 * s'il n'existe pas — la même réponse que pour un bien inconnu, sans révéler qu'un autre compte
 * l'a en favori.
 */
class UpdateFavoriteRequest extends BaseFormRequest
{
    public const NOTES_MAX = 500;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'notes' => ['present', 'nullable', 'string', 'max:'.self::NOTES_MAX],
        ];
    }
}
