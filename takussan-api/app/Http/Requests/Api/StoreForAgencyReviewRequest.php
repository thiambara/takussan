<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-305 — extrait de ReviewController::storeForAgency(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreForAgencyReviewRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur vérifiait l'éligibilité avant de valider ; un FormRequest valide avant le
     * corps du contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * éligible et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * ⚠ **REPRISE, pas délégation** : il n'existe pas de `ReviewPolicy`. L'expression est
     * reproduite à l'identique ; son domicile définitif est une policy, et le ticket de suite
     * (les 19 helpers hors périmètre de TCK-306) doit la convertir en délégation.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        $agency = $this->route('agency');

        if ($user === null || $agency === null) {
            return false;
        }

        return $user->isSuperAdmin()
            || $agency->leases()
                ->whereHas('tenant', fn ($q) => $q->where('user_id', $user->id))
                ->exists();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'title' => ['nullable', 'string'],
            'content' => ['nullable', 'string'],
        ];
    }
}
