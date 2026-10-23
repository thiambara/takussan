<?php

namespace App\Rules;

use App\Models\Property;
use App\Models\User;
use App\Services\Maintenance\ProviderEligibility;
use App\Services\Property\PrimaryPropertyContact;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-592 — `assigned_to` ne reçoit qu'un compte assignable au bien : prestataire actif en
 * collaboration active avec l'agence du bien, ou membre de son équipe ({@see ProviderEligibility}).
 *
 * Un 422 qui NOMME `assigned_to`, pas un 403 : celui qui assigne en a le droit, c'est la cible qui
 * ne convient pas. `null` (désassigner) n'est pas jugé ici.
 *
 * P120.03 — la CIBLE est jugée comme toutes les autres cibles d'attribution (P88.02) : un membre
 * de l'équipe par {@see PersonnelDeLAgence::estPersonnel()}, un prestataire seulement si son
 * compte est joignable (ni bloqué, ni supprimé). `isStaffAt()` et la collaboration active ne
 * lisaient pas `users.status` : un compte bloqué recevait l'intervention. Le prédicat d'ACCÈS de
 * l'assigné ({@see ProviderEligibility::isAssignable()}, policy et avis) n'est pas changé ici.
 */
class AssignableProvider implements ValidationRule
{
    public function __construct(private readonly ?Property $property) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null || $value === '') {
            return;
        }

        $user = is_numeric($value) ? User::query()->find((int) $value) : null;

        if (! $this->assignable($user)) {
            $fail(__('maintenance.errors.not_assignable'));
        }
    }

    private function assignable(?User $user): bool
    {
        $agencyId = $this->property?->agency_id;
        if ($user === null || $agencyId === null) {
            return false;
        }

        return PersonnelDeLAgence::estPersonnel($user, $agencyId)
            || (PrimaryPropertyContact::joignable($user)
                && app(ProviderEligibility::class)->isActiveProviderAt($user, (int) $agencyId));
    }
}
