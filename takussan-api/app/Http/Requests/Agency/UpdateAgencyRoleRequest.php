<?php

namespace App\Http\Requests\Agency;

use App\Http\Requests\BaseFormRequest;
use App\Models\AgencyRole;
use Illuminate\Validation\Rule;

/**
 * TCK-279 — édition d'un rôle non-système (nom, description).
 *
 * `base_profile_type` n'est **pas** modifiable : le changer réaffecterait
 * silencieusement des profils d'un type à un autre, alors que la seule
 * transition prévue par la spec est la réaffectation explicite du profil.
 */
class UpdateAgencyRoleRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $role = $this->route('role');

        return $role instanceof AgencyRole
            && $this->user()?->can('update', $role) === true;
    }

    /**
     * @return array<string,mixed>
     */
    public function rules(): array
    {
        $role = $this->route('role');
        $agencyId = $role instanceof AgencyRole ? $role->agency_id : null;
        $roleId = $role instanceof AgencyRole ? $role->id : null;

        return [
            'name' => [
                'sometimes', 'required', 'string', 'max:120',
                Rule::unique('agency_roles', 'name')
                    ->where(fn ($q) => $q->where('agency_id', $agencyId))
                    ->ignore($roleId),
            ],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'is_clonable' => ['sometimes', 'boolean'],
        ];
    }
}
