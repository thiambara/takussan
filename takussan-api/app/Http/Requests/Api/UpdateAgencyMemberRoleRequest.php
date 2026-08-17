<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
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
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * ⚠ **REPRISE, pas délégation** : cette règle n'est pas encore dans une policy — elle fait
     * partie des 19 helpers relevés hors périmètre de TCK-306. L'expression est reproduite à
     * l'identique ; son domicile définitif est une policy, et le ticket de suite doit la
     * convertir en délégation comme les 35 autres.
     */
    public function authorize(): bool
    {
        $actor = $this->user();
        $agency = $this->route('agency');

        return $actor !== null && ($actor->isSuperAdmin()
            || $agency->primary_admin_id === $actor->id
            || ($this->activeProfile()?->agency_id === $agency->id && $actor->isAgencyAdminAt((int) $agency->id)));
    }

    /**
     * TCK-305 — la liste vivait dans un `protected function allowedRoles()` du contrôleur,
     * donc hors de portée des règles une fois déplacées.
     *
     * @var list<string>
     */
    public const ALLOWED_ROLES = [
        'super_admin',
        'agency_admin',
        'agent',
        'owner',
        'tenant',
        'customer',
        'service_provider',
    ];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'role' => ['required', 'string', Rule::in(self::ALLOWED_ROLES)],
        ];
    }
}
