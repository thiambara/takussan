<?php

namespace App\Http\Requests\Invitation;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\Invitation;
use App\Services\Invitation\InvitationService;
use Closure;

/**
 * TCK-2665 — `DELETE /api/invitations/expired?filter[role]=agent,agency_admin` : les rôles sont
 * EXIGÉS (une purge sans rôle viderait tout) et connus — ceux d'une invitation d'agence
 * (`InvitationService::INVITABLE_TYPE_BY_ROLE`). Autorisation avant validation : l'agence active
 * (`staffAgencyId`) et `InvitationPolicy::purgeExpired`.
 */
class PurgeExpiredInvitationsRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $agency = $this->agency();

        return $agency !== null && $this->user()?->can('purgeExpired', [Invitation::class, $agency]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter' => ['required', 'array'],
            'filter.role' => ['required', 'string', function (string $attribute, mixed $value, Closure $fail): void {
                $inconnus = array_diff($this->roles(), array_keys(InvitationService::INVITABLE_TYPE_BY_ROLE));
                if ($this->roles() === [] || $inconnus !== []) {
                    $fail(__('validation.in', ['attribute' => $attribute]));
                }
            }],
        ];
    }

    /** L'agence active du demandeur, ou `null` hors d'un espace. */
    public function agency(): ?Agency
    {
        $agencyId = $this->user()?->staffAgencyId();

        return $agencyId !== null ? Agency::query()->find($agencyId) : null;
    }

    /** @return list<string> les rôles demandés, sans doublon */
    public function roles(): array
    {
        $valeur = $this->input('filter.role');

        return is_string($valeur)
            ? array_values(array_unique(array_filter(array_map('trim', explode(',', $valeur)), fn (string $r) => $r !== '')))
            : [];
    }
}
