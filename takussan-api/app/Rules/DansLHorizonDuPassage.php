<?php

namespace App\Rules;

use App\Models\MaintenanceRequest;
use Closure;
use DateTimeInterface;
use Illuminate\Contracts\Validation\ValidationRule;
use Throwable;

/**
 * TCK-2715 — le passage d'une intervention ne se pose pas au-delà de
 * {@see MaintenanceRequest::SCHEDULING_HORIZON_MONTHS} mois à compter de maintenant, borne incluse.
 * Une seule règle pour les deux routes qui écrivent `scheduled_at` : l'acceptation
 * (`AcceptMaintenanceRequestRequest`, TCK-2680) et le `PATCH` (`UpdateMaintenanceRequestRequest`).
 *
 * La borne se juge sur l'INSTANT désigné, après la conversion qu'emploient les deux routes à
 * l'écriture ({@see MaintenanceRequest::scheduledInstant()}, TCK-2700) : `07:30-01:00` est 08:30 UTC.
 *
 * Une valeur nulle, vide ou illisible n'est pas jugée ici : `nullable` et `date` en répondent (422),
 * et une conversion qui lèverait rendrait un 500.
 */
class DansLHorizonDuPassage implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) && ! $value instanceof DateTimeInterface) {
            return;
        }
        if (is_string($value) && trim($value) === '') {
            return;
        }

        try {
            $instant = MaintenanceRequest::scheduledInstant($value);
        } catch (Throwable) {
            return;
        }

        if ($instant->greaterThan(MaintenanceRequest::schedulingHorizon())) {
            $fail(__('maintenance.errors.beyond_scheduling_horizon'));
        }
    }
}
