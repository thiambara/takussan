<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\User;

/**
 * TCK-999 (P15.06, Q5 ; ADR-0036, amendement du 2026-10-19, voie 3) — « changer le titulaire » : son
 * aperçu (`GET …/owner-transfer?owner_id=`) et le transfert (`PUT …/owner`). Le même corps pour les
 * deux : le compte du bailleur visé.
 *
 * L'autorisation court ICI, avant la validation : simple DÉLÉGATION à
 * `PropertyPolicy::transferOwner` (l'admin de l'agence du bien). La cible se juge ensuite par
 * `PropertyOwnerTransfer::refus()` — la règle de `owner_id` à la saisie (TCK-997), qui rend son code
 * métier, comme pour un compte qui n'existe pas.
 */
class TransferPropertyOwnerRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('transferOwner', $this->route('property')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'owner_id' => ['required', 'integer', 'min:1'],
        ];
    }

    /** Le compte visé ; un compte absent rend le refus de la cible, sans dire qu'il n'existe pas. */
    public function bailleur(): User
    {
        $owner = User::query()->find((int) $this->validated('owner_id'));
        abort_code_if($owner === null, 422, 'property.owner_not_in_agency');

        return $owner;
    }
}
