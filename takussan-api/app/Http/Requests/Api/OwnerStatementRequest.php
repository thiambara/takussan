<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\User;

/**
 * TCK-594 (ADR-0039 §3) — `GET /api/owner-statements?period=YYYY-MM|YYYY[&landlord_id=][&agency_id=]`.
 *
 * Sans `landlord_id`, le relevé est celui du lecteur ; sans `agency_id`, celui de l'agence de son
 * profil actif. L'autorisation est `OwnerStatementPolicy::view`.
 */
class OwnerStatementRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $landlord = $this->landlord();
        $agency = $this->agency();

        return $landlord !== null && $agency !== null
            && $this->user()?->can('viewOwnerStatement', [$landlord, $agency]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'period' => ['required', 'string', 'regex:/^\d{4}(-(0[1-9]|1[0-2]))?$/'],
            'landlord_id' => ['sometimes', 'integer'],
            'agency_id' => ['sometimes', 'integer'],
        ];
    }

    public function landlord(): ?User
    {
        return $this->filled('landlord_id') ? User::query()->find($this->integer('landlord_id')) : $this->user();
    }

    public function agency(): ?Agency
    {
        $id = $this->filled('agency_id')
            ? $this->integer('agency_id')
            : ($this->user()?->staffAgencyId() ?? $this->user()?->agency_id);

        return $id !== null ? Agency::query()->find($id) : null;
    }
}
