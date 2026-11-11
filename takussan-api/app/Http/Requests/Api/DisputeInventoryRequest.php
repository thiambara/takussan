<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Inventory;
use App\Policies\InventoryPolicy;

/**
 * TCK-305 — extrait de InventoryController::dispute(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class DisputeInventoryRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * **Simple DÉLÉGATION** : la règle vit dans sa policy, cette méthode ne fait que l'invoquer —
     * aucune règle d'autorisation n'a migré ici (AC4).
     *
     * TCK-2646 (ADR-0098 §7) — les deux parties seulement (`InventoryPolicy::dispute`), appelée EN
     * DIRECT : par `can()`, `Gate::before` l'accorderait au super-admin, qui n'est pas une partie.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        $inventory = $this->route('inventory');

        return $user !== null && $inventory instanceof Inventory
            && app(InventoryPolicy::class)->dispute($user, $inventory);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string'],
        ];
    }
}
