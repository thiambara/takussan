<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\MaintenanceRequest;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * TCK-2680 — `POST /api/maintenance-requests/{id}/accept {scheduled_at?}` : le prestataire assigné
 * accepte, et peut proposer son passage dans le même geste.
 *
 * L'autorisation court ICI, avant la validation (TCK-305) : délégation à `respondToAssignment`, la
 * politique qu'invoquait le contrôleur. Un tiers qui poste une date passée prend 403, pas 422.
 *
 * `scheduled_at` est facultatif et nullable : absent ou nul, l'acceptation est celle d'avant (aucune
 * heure touchée). Présent, il doit désigner un instant à venir.
 */
class AcceptMaintenanceRequestRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('respondToAssignment', $this->route('maintenanceRequest')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'scheduled_at' => ['sometimes', 'nullable', 'date', 'after:now'],
        ];
    }

    /**
     * Le créneau proposé. Une heure sans décalage se lit à l'heure de Dakar
     * (`MaintenanceRequest::SCHEDULED_TIMEZONE`, UTC+0) ; une heure qui porte son décalage est
     * l'instant qu'elle désigne. `MaintenanceRequestService::accept()` le ramène au fuseau de
     * l'application avant de l'écrire.
     */
    public function scheduledAt(): ?CarbonInterface
    {
        $value = $this->validated('scheduled_at');
        if ($value === null) {
            return null;
        }

        return CarbonImmutable::parse((string) $value, MaintenanceRequest::SCHEDULED_TIMEZONE);
    }
}
