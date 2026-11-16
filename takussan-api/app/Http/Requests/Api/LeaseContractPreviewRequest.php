<?php

namespace App\Http\Requests\Api;

use App\Models\Property;

/**
 * TCK-2906 — `POST /api/leases/contract-preview` : le formulaire de création d'un bail, jugé EXACTEMENT
 * comme la création ({@see StoreLeaseRequest}) — `LeasePolicy::createOn` sur le bien dans `authorize()`,
 * donc AVANT les règles (TCK-2767), puis les mêmes règles. Un aperçu qui validerait moins que la création
 * imprimerait un contrat que l'API refuserait d'écrire.
 */
class LeaseContractPreviewRequest extends StoreLeaseRequest
{
    /** Le bien jugé par `authorize()`, relu par le contrôleur sans seconde requête. */
    public function property(): Property
    {
        $property = $this->authorizedProperty();
        abort_if($property === null, 403);

        return $property;
    }
}
