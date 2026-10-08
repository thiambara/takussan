<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-305 — extrait de FavoriteController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreFavoriteRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE migre PAS ici : elle appartient au contrôleur puis aux policies
     * (principes non négociables 1 et 2, et TCK-306). `BaseFormRequest` refuse par défaut —
     * *fail-closed* — donc sans cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // TCK-599 (contrainte 11) — plus de `exists:properties,id` : un 422 pour un identifiant
            // inexistant contre un 403 pour un bien privé faisait de l'ajout un ORACLE d'existence.
            // L'inexistence se juge dans le contrôleur, avec la même réponse que l'invisibilité.
            'property_id' => ['required', 'integer'],
            'notes' => ['nullable', 'string', 'max:'.UpdateFavoriteRequest::NOTES_MAX],
        ];
    }
}
