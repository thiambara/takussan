<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PropertyStatus;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de PropertyController::updateStatus(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateStatusPropertyRequest extends BaseFormRequest
{
    /**
     * TCK-587 — les statuts qui mettent un bien au catalogue : les poser, c'est publier. Relu par
     * `UpdatePropertyRequest` (P147.01, TCK-1427), pour que le `PATCH` juge la même règle.
     */
    public const STATUTS_QUI_PUBLIENT = [PropertyStatus::Available->value, PropertyStatus::Published->value];

    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * **Simple DÉLÉGATION** : la règle vit dans sa policy, cette méthode ne fait que l'invoquer —
     * aucune règle d'autorisation n'a migré ici (AC4).
     */
    public function authorize(): bool
    {
        $user = $this->user();
        $property = $this->route('property');

        if ($user?->can('update', $property) !== true) {
            return false;
        }

        // TCK-587 — passer un bien en `available` / `published` le met au catalogue : c'est publier,
        // et `PUT …/status` était un contournement de `publish`.
        return ! in_array($this->input('status'), self::STATUTS_QUI_PUBLIENT, true)
            || $user->can('publish', $property);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // P147.05 (TCK-1341) — les statuts de modération ne se posent pas à la main.
            'status' => ['required', Rule::enum(PropertyStatus::class)->except(PropertyStatus::NOT_SETTABLE_BY_HAND)],
        ];
    }
}
