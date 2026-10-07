<?php

namespace App\Rules;

use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-590 (contrainte 6) — une heure de visite demandée par un visiteur tombe sur un créneau de la
 * grille : 09:00 à 18:30 par pas de 30 minutes, **heure de Dakar**.
 *
 * Le front construisait l'heure dans le fuseau du NAVIGATEUR : un visiteur à Paris qui choisissait
 * « 10:00 » créait une visite à 9 h ou 8 h à Dakar. Le front corrigé ne peut plus le faire, et le
 * serveur le refuse quand même : une heure hors grille est le symptôme exact de ce défaut.
 */
class CreneauDeVisite implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || $value === '') {
            return;
        }

        try {
            $local = CarbonImmutable::parse($value)->setTimezone(VisitSchedulingService::TIMEZONE);
        } catch (\Throwable) {
            return; // la règle `date` le refuse déjà
        }

        if (! VisitSchedulingService::estSurLaGrille($local)) {
            $fail(__('visits.slot_off_grid'));
        }
    }
}
