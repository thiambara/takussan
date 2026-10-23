<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Policies\AgencyPolicy;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de UserRoleController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateUserRoleRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation : un appel non autorisé ET mal formé
     * rend 403, pas 422.
     *
     * TCK-1498 (P116.01) — DÉLÉGATION à {@see AgencyPolicy::changeMemberRole()} sur l'agence du
     * profil actif : `team.assign_role` dans cette agence. Le super-admin passe sans agence active,
     * comme avant. La reprise « être admin de l'agence active » est retirée.
     */
    public function authorize(): bool
    {
        $actor = $this->user();
        if ($actor === null) {
            return false;
        }
        if ($actor->isSuperAdmin()) {
            return true;
        }

        $agenceActive = $this->activeProfile()?->agency_id ?? $actor->agency_id;
        $agency = $agenceActive !== null ? Agency::query()->find($agenceActive) : null;

        return $agency !== null && $actor->can('changeMemberRole', $agency);
    }

    /**
     * TCK-305 — la liste vivait dans un `protected function allowedRoles()` du contrôleur,
     * donc hors de portée des règles une fois déplacées.
     *
     * TCK-600 (ADR-0047 §4) — `super_admin` n'y est plus : la cooptation est le SEUL chemin
     * d'octroi d'un `PlatformProfile`. Ce PUT créait un super-admin sans invitation, sans 2FA
     * forcée ni activité, réactivait un profil révoqué et promouvait un `support`.
     *
     * @var list<string>
     */
    public const ALLOWED_ROLES = [
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
