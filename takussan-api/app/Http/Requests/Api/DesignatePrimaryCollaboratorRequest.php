<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-504 (contrainte 4, ADR-0053 §4) — désigner l'agent principal d'un bien.
 *
 * Le geste est une écriture sur le bien : **simple DÉLÉGATION** à `update` de `PropertyPolicy`, la
 * règle qui gouverne déjà `store`, `update` et `destroy` des collaborateurs. Aucune règle neuve, ni
 * ici ni en contrôleur. La requête ne porte pas de corps : la cible est la ligne de la route, et ce
 * qui la refuse (rôle, éligibilité) vit dans `PrimaryAgentDesignator`, que TCK-603 appelle aussi.
 */
class DesignatePrimaryCollaboratorRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('property')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
