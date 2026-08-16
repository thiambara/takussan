<?php

namespace App\Http\Requests\Agency;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use Illuminate\Validation\Rule;

/**
 * TCK-279 — création d'un rôle personnalisé, éventuellement par clonage.
 *
 * L'autorisation est portée par `AgencyRolePolicy@create` et déclenchée
 * dans le contrôleur : `BaseFormRequest::authorize()` est fail-closed, on
 * le rouvre ici en déléguant à la même policy plutôt qu'en dupliquant sa
 * logique.
 */
class StoreAgencyRoleRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $agency = $this->route('agency');

        return $agency instanceof Agency
            && $this->user()?->can('create', [AgencyRole::class, $agency]) === true;
    }

    /**
     * @return array<string,mixed>
     */
    public function rules(): array
    {
        $agency = $this->route('agency');
        $agencyId = $agency instanceof Agency ? $agency->id : null;

        return [
            'name' => [
                'required', 'string', 'max:120',
                Rule::unique('agency_roles', 'name')->where(
                    fn ($q) => $q->where('agency_id', $agencyId)
                ),
            ],
            'base_profile_type' => ['required', Rule::enum(AgencyRoleBaseType::class)],
            'description' => ['nullable', 'string', 'max:1000'],
            // Clone d'un rôle existant de la MÊME agence. La vérification du
            // même `base_profile_type` est faite dans le contrôleur, où l'on
            // dispose du modèle chargé.
            'clone_from' => [
                'nullable', 'integer',
                Rule::exists('agency_roles', 'id')->where(
                    fn ($q) => $q->where('agency_id', $agencyId)
                ),
            ],
        ];
    }
}
