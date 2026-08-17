<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-305 — extrait de MaintenanceRequestController::complete(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class CompleteMaintenanceRequestRequest extends BaseFormRequest
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
            'resolution_notes' => ['nullable', 'string'],
            'cost' => ['nullable', 'numeric', 'min:0'],
            'actual_cost' => ['nullable', 'numeric', 'min:0'],
            'photos' => ['nullable', 'array'],
            'photos.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
        ];
    }
}
