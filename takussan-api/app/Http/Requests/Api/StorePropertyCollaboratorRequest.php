<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\CollaboratorRole;
use App\Rules\CollaboratorEligibleForProperty;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de PropertyCollaboratorController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StorePropertyCollaboratorRequest extends BaseFormRequest
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
     */
    public function authorize(): bool
    {
        $property = $this->route('property');
        if ($this->user()?->can('update', $property) !== true) {
            return false;
        }

        // TCK-2364 (P241.01, ADR-0049 amendé le 2026-10-25) — une part non nulle est la ventilation
        // de la commission de l'agence : `update` ne suffit pas, le bailleur du bien le tient.
        abort_code_if(
            (float) $this->input('commission_share') > 0 && ! $this->user()->can('manageCommissionShares', $property),
            403,
            'property.commission_share_forbidden',
        );

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // TCK-586 — un collaborateur appartient à l'agence du bien, selon son rôle.
            'user_id' => [
                'required',
                'integer',
                // TCK-1117 (P96.01) — un compte supprimé en douceur suit le chemin d'un identifiant
                // absent : `exists:` nu le laissait passer, et la règle d'éligibilité, qui ne le
                // trouve pas par `find()`, s'en remet à celle-ci.
                Rule::exists('users', 'id')->whereNull('deleted_at'),
                new CollaboratorEligibleForProperty($this->route('property'), $this->input('role'), $this->user()),
            ],
            'role' => ['required', Rule::enum(CollaboratorRole::class)],
            // TCK-1448 (P86.03, ADR-0049 « Ventilation » § 1) — seul un `agent` est servi par le grand
            // livre : une part positive sur un autre rôle n'irait à personne et mangerait le plafond.
            'commission_share' => [
                'nullable', 'numeric', 'min:0', 'max:100',
                Rule::prohibitedIf(fn () => $this->input('role') !== CollaboratorRole::Agent->value
                    && (float) $this->input('commission_share') > 0),
            ],
        ];
    }
}
