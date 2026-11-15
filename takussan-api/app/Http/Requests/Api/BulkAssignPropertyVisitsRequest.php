<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Rules\PersonnelDeLAgence;

/**
 * TCK-2585 — attribuer en lot : `{ids[], agent_id}`, 50 au plus. Réservé à qui détient `crm.assign`
 * dans l'agence de son profil actif, où il est personnel (403 avant toute validation) ; l'agent
 * désigné est du personnel actif de cette agence. Chaque ligne se juge ensuite dans le contrôleur,
 * dans l'agence DE SON BIEN.
 */
class BulkAssignPropertyVisitsRequest extends BaseFormRequest
{
    public const MAX = 50;

    public function authorize(): bool
    {
        $user = $this->user();
        if ($user === null) {
            return false;
        }
        if ($user->isSuperAdmin()) {
            return true;
        }

        $agency = $this->agency();

        return $agency !== null && $user->canActAt(Capability::CrmAssign, $agency);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $user = $this->user();

        return [
            'ids' => ['required', 'array', 'min:1', 'max:'.self::MAX],
            'ids.*' => ['required', 'integer', 'min:1', 'distinct'],
            // Le super-admin n'a pas d'agence : l'agent se juge alors ligne par ligne.
            'agent_id' => array_values(array_filter([
                'required', 'integer',
                $user?->isSuperAdmin() ? null : new PersonnelDeLAgence($this->agency()?->id),
            ])),
        ];
    }

    /** L'agence où l'appelant est personnel actif — celle de son profil actif, au plus une. */
    public function agency(): ?Agency
    {
        $user = $this->user();
        $id = $user !== null ? (PersonnelDeLAgence::agencesOuPersonnelActif($user)[0] ?? null) : null;

        return $id !== null ? Agency::query()->find($id) : null;
    }
}
