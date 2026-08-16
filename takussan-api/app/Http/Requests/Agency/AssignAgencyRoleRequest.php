<?php

namespace App\Http\Requests\Agency;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\AgencyRoleBaseType;
use Illuminate\Validation\Rule;

/**
 * TCK-279 — `PATCH /api/profiles/{profile}/agency-role` (AC7).
 *
 * ⚠️ `profile_type` est **obligatoire**, et ce n'est pas un confort d'API.
 * Le ticket écrit l'URL `profiles/{profile}` comme si un id désignait un
 * profil, or les profils sont polymorphes : l'id 12 existe simultanément
 * dans `agent_profiles`, `owner_profiles` et `agency_admin_profiles`.
 * `routes/api/profiles.php` avait déjà tranché en liant explicitement
 * `{agent_profile}`. On garde l'URL du ticket et on désambiguïse par le
 * corps — un `{profile_type}/{id}` aurait changé le contrat.
 *
 * L'autorisation est portée par le contrôleur (il faut avoir résolu
 * l'agence du profil pour juger `team.assign_role`).
 */
class AssignAgencyRoleRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string,mixed>
     */
    public function rules(): array
    {
        return [
            'profile_type' => [
                'required',
                Rule::in(array_map(
                    static fn (AgencyRoleBaseType $t): string => $t->value,
                    AgencyRoleBaseType::assignableTypes(),
                )),
            ],
            'agency_role_id' => ['required', 'integer', 'exists:agency_roles,id'],
        ];
    }

    /**
     * @return array<string,string>
     */
    public function messages(): array
    {
        return [
            'profile_type.in' => 'Ce type de profil ne porte pas de rôle d\'agence.',
        ];
    }
}
