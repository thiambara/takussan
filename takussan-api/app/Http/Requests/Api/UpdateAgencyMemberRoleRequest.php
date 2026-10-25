<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Policies\AgencyPolicy;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de AgencyMemberRoleController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateAgencyMemberRoleRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation : un appel non autorisé ET mal formé
     * rend 403, pas 422.
     *
     * TCK-1498 (P116.01) — DÉLÉGATION à {@see AgencyPolicy::changeMemberRole()} : `team.assign_role`
     * dans l'agence de la route, l'administrateur principal et le super-admin compris. La reprise
     * « être admin de l'agence active » est retirée.
     */
    public function authorize(): bool
    {
        $agency = $this->route('agency');

        return $agency instanceof Agency && $this->user()?->can('changeMemberRole', $agency) === true;
    }

    /**
     * TCK-305 — la liste vivait dans un `protected function allowedRoles()` du contrôleur,
     * donc hors de portée des règles une fois déplacées.
     *
     * TCK-2372 (P249.01) — la liste ne porte plus que les rôles que les deux routes matérialisent,
     * et {@see UpdateUserRoleRequest} la partage. `super_admin`, `tenant`, `customer` et
     * `service_provider` passaient la validation, tombaient sur un `default => null` du contrôleur,
     * et la réponse rendait 200 avec le rôle demandé sans qu'aucun profil change. Ils rendent 422.
     *
     * @var list<string>
     */
    public const ALLOWED_ROLES = [
        'agency_admin',
        'agent',
        'owner',
    ];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'role' => ['required', 'string', Rule::in(self::ALLOWED_ROLES)],
        ];
    }
}
