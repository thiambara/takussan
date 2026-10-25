<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\CollaboratorRole;
use App\Models\PropertyCollaborator;
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
        $property = $this->route('property');
        if ($this->user()?->can('update', $property) !== true) {
            return false;
        }

        // TCK-2364 (P241.01, ADR-0049 amendé le 2026-10-25) — changer la part, l'effacer comprise,
        // c'est écrire la ventilation de la commission de l'agence. Renvoyer la part telle qu'elle
        // est n'écrit rien. Une part absente vaut 0, comme au grand livre.
        abort_code_if(
            $this->changeLaPart() && ! $this->user()->can('manageCommissionShares', $property),
            403,
            'property.commission_share_forbidden',
        );

        return true;
    }

    private function changeLaPart(): bool
    {
        if (! $this->has('commission_share')) {
            return false;
        }

        $ligne = $this->route('collaborator');
        $actuelle = $ligne instanceof PropertyCollaborator ? (float) $ligne->commission_share : 0.0;

        return round((float) $this->input('commission_share'), 2) !== round($actuelle, 2);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'role' => ['sometimes', Rule::enum(CollaboratorRole::class)],
            // TCK-1448 (P86.03) — une part positive n'est permise qu'au rôle `agent`, celui que la
            // ligne aura après la modification.
            'commission_share' => [
                'sometimes', 'nullable', 'numeric', 'min:0', 'max:100',
                Rule::prohibitedIf(fn () => $this->roleApres() !== CollaboratorRole::Agent
                    && (float) $this->input('commission_share') > 0),
            ],
        ];
    }

    /** Le rôle de la ligne après la modification : celui demandé, à défaut le sien. */
    public function roleApres(): ?CollaboratorRole
    {
        if ($this->has('role')) {
            return CollaboratorRole::tryFrom((string) $this->input('role'));
        }

        $role = $this->route('collaborator')->role;

        return $role instanceof CollaboratorRole ? $role : CollaboratorRole::tryFrom((string) $role);
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

            (new CollaboratorEligibleForProperty($this->route('property'), $this->input('role'), $this->user()))
                ->validate('role', $this->route('collaborator')->user_id, function (string $message) use ($validator): void {
                    $validator->errors()->add('role', $message);
                });
        });
    }
}
