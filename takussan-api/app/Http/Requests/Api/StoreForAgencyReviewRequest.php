<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Lease;
use App\Services\Review\ReviewEligibility;

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
    private ?Lease $proof = null;

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

        // TCK-597 — la règle vit dans `ReviewEligibility`, inchangée. TCK-2577 — la preuve trouvée est
        // gardée pour le contrôleur, qui l'écrit dans `context_*` (ADR-0043 § 3). Elle est cherchée
        // AVANT le passe-droit du super-admin : un super-admin locataire écrit lui aussi son bail.
        $this->proof = app(ReviewEligibility::class)->forAgency($user, $agency);

        return $this->proof !== null || $user->isSuperAdmin();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'title' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /**
     * TCK-2577 — le bail qui rend l'avis possible, ou `null` pour le super-admin sans bail : son avis
     * reste alors sans contexte, et la fiche n'affiche rien (comme un avis antérieur).
     */
    public function proof(): ?Lease
    {
        return $this->proof;
    }
}
