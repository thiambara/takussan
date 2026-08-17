<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-305 — extrait de CalendarController::index(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class IndexCalendarRequest extends BaseFormRequest
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
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'property_id' => ['sometimes', 'integer', 'exists:properties,id'],
            // TCK-078 — admin multi-property view supports `property_ids[]`.
            'property_ids' => ['sometimes', 'array'],
            'property_ids.*' => ['integer', 'exists:properties,id'],
            // TCK-078 — admin-only cross-agency view.
            'agency_id' => ['sometimes', 'integer', 'exists:agencies,id'],
            'types' => ['sometimes', 'array'],
            'types.*' => ['string', 'in:booking,visit'],
        ];
    }
}
