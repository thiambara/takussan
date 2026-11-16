<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\MaintenanceRequest;
use App\Models\MaintenanceRescheduleRequest;
use App\Rules\DansLHorizonDuPassage;
use App\Rules\InstantIso;
use Carbon\CarbonInterface;

/**
 * TCK-2917 (ADR-0118 § 3) — `POST /api/maintenance-requests/{id}/reschedule-requests
 * {proposed_slots: [instant, …], note?}` : le demandeur propose un à trois autres créneaux.
 *
 * L'autorisation court ICI, avant la validation (TCK-305) : `requestReschedule` — un autre locataire
 * prend 403, pas 422. Chaque créneau suit les règles des deux routes qui écrivent `scheduled_at` :
 * instant ISO, à venir, dans l'horizon (TCK-2715), converti par `MaintenanceRequest::scheduledInstant()`
 * (TCK-2700).
 */
class StoreMaintenanceRescheduleRequestRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('requestReschedule', $this->route('maintenanceRequest')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'proposed_slots' => ['required', 'array', 'list', 'min:1', 'max:'.MaintenanceRescheduleRequest::MAX_SLOTS],
            'proposed_slots.*' => ['required', 'date', new InstantIso, 'after:now', new DansLHorizonDuPassage],
            'note' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * Les créneaux proposés, convertis en instants, sans doublon, dans l'ordre chronologique.
     *
     * @return list<CarbonInterface>
     */
    public function slots(): array
    {
        $slots = collect($this->validated('proposed_slots'))
            ->map(fn (mixed $slot): CarbonInterface => MaintenanceRequest::scheduledInstant((string) $slot))
            ->unique(fn (CarbonInterface $slot): int => $slot->getTimestamp())
            ->sortBy(fn (CarbonInterface $slot): int => $slot->getTimestamp())
            ->values()
            ->all();

        return $slots;
    }
}
