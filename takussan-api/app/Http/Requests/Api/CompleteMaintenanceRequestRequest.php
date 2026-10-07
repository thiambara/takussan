<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\MaintenanceStatus;

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
    /** Les champs de coût, réservés au donneur d'ordre. */
    public const PRINCIPAL_FIELDS = ['cost', 'actual_cost'];

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
        $maintenanceRequest = $this->route('maintenanceRequest');

        // TCK-592 — terminer est une transition : (acteur, `completed`), pas `update`.
        if ($user?->can('transitionTo', [$maintenanceRequest, MaintenanceStatus::Completed]) !== true) {
            return false;
        }

        // TCK-592 (verif-592, M1) — le coût est un champ du DONNEUR D'ORDRE, ici comme au `PATCH`
        // (AC1) : sa seule PRÉSENCE exige `actAsPrincipal`, et le prestataire prend un 403.
        return ! $this->hasAny(self::PRINCIPAL_FIELDS)
            || $user->can('actAsPrincipal', $maintenanceRequest) === true;
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
