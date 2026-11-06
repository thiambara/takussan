<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-305 — extrait de FeatureFlagController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateFeatureFlagRequest extends BaseFormRequest
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
            'enabled' => ['required', 'boolean'],
            'segments' => ['nullable', 'array'],
            // TCK-2488 — borne technique : saisie libre dans `feature-flags.tsx`, et `profileTypes()` rend au plus 7 slugs.
            'segments.roles' => ['nullable', 'array', 'max:100'],
            'segments.roles.*' => ['string'],
            // TCK-2488 — borne technique, aucun appelant n'en ajoute : `feature-flags.tsx` renvoie la liste déjà posée.
            'segments.agency_ids' => ['nullable', 'array', 'max:1000'],
            'segments.agency_ids.*' => ['integer'],
            'segments.rollout_percentage' => ['nullable', 'integer', 'min:0', 'max:100'],
        ];
    }
}
