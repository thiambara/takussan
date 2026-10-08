<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\CollaboratorRole;
use App\Rules\CollaboratorEligibleForProperty;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de PropertyCollaboratorController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdatePropertyCollaboratorRequest extends BaseFormRequest
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
        return $this->user()?->can('update', $this->route('property')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'role' => ['sometimes', Rule::enum(CollaboratorRole::class)],
            'commission_share' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
        ];
    }

    /**
     * TCK-586 — changer le rôle rejuge l'éligibilité du collaborateur EXISTANT : un bailleur
     * ajouté en `viewer` ne devient pas `agent` (et contact public du bien) par un `PUT`.
     * La requête ne porte pas de `user_id` ; l'erreur se lit donc sur `role`.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (! $this->has('role') || $validator->errors()->has('role')) {
                return;
            }

            (new CollaboratorEligibleForProperty($this->route('property'), $this->input('role')))
                ->validate('role', $this->route('collaborator')->user_id, function (string $message) use ($validator): void {
                    $validator->errors()->add('role', $message);
                });
        });
    }
}
