<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-305 — extrait de PropertyMediaController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StorePropertyMediaRequest extends BaseFormRequest
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
            'photos' => ['required', 'array'],
            'photos.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'photos.required' => 'Sélectionnez au moins une photo.',
            'photos.*.image' => 'Le fichier doit être une image lisible.',
            'photos.*.mimes' => 'Formats acceptés : JPG, PNG ou WebP.',
            'photos.*.max' => 'Chaque photo doit peser 10 Mo maximum.',
        ];
    }
}
