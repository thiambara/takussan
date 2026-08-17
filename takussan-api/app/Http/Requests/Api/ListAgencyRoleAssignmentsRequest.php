<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\AgencyRole;
use Illuminate\Support\Facades\Gate;

/**
 * TCK-305 × TCK-279 — extrait de RoleController::assignments().
 *
 * ⚠ Ce fichier naît d'un conflit que ni l'une ni l'autre des deux branches ne pouvait voir.
 * `RoleController::assignments()` a été écrit par TCK-279 pendant que TCK-305 convergeait les
 * 120 validations en ligne du dépôt vers des FormRequest et posait la garde qui les interdit.
 * Aucun des deux n'avait tort ; leur SOMME violait la garde, et c'est l'intégration des deux
 * branches qui l'a révélé — pas leur CI respective, où chacune était verte.
 */
class ListAgencyRoleAssignmentsRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendrait 422 là où l'API rend 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * **Simple DÉLÉGATION** : la règle vit dans `AgencyRolePolicy`, cette méthode ne fait que
     * l'invoquer — aucune règle d'autorisation n'a migré ici.
     */
    public function authorize(): bool
    {
        $agency = $this->route('agency');

        return $agency instanceof Agency
            && Gate::allows('viewAny', [AgencyRole::class, $agency]);
    }

    /**
     * `user_ids` se lit en LISTE SÉPARÉE PAR DES VIRGULES (`?user_ids=3,7,12`), et non en
     * `user_ids[]=` : c'est la seule forme que produit le sérialiseur canonique du front
     * (`buildQueryString`, échappatoire `extra`). La forme tableau reste acceptée.
     *
     * ⚠ `parent::prepareForValidation()` est appelé D'ABORD : il trim et transforme `""` en
     * `null`, donc `?user_ids=` (vide) devient `null` et tombe sur `required` — un 422 clair
     * plutôt qu'un tableau vide silencieux.
     */
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();

        $raw = $this->input('user_ids');

        if (is_string($raw)) {
            $this->merge([
                'user_ids' => array_values(array_filter(
                    explode(',', $raw),
                    static fn (string $value): bool => trim($value) !== '',
                )),
            ]);
        }
    }

    /**
     * `user_ids` est REQUIS, et c'est le cœur du contrat : sans lui, la réponse serait la liste
     * non bornée des profils d'une agence, qu'il aurait fallu paginer ou tronquer — et une
     * troncature silencieuse afficherait « — » à des membres qui ont bien un rôle. Borner
     * l'entrée rend le cas inexprimable (TCK-279).
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'user_ids' => ['required', 'array', 'min:1', 'max:200'],
            'user_ids.*' => ['integer'],
        ];
    }

    /** @return list<int> */
    public function userIds(): array
    {
        /** @var list<int|string> $ids */
        $ids = $this->validated('user_ids');

        return array_map('intval', $ids);
    }
}
