<?php

namespace App\Rules;

use App\Models\Property;
use App\Models\User;
use App\Services\Maintenance\ProviderEligibility;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-592 — `assigned_to` ne reçoit qu'un compte assignable au bien : prestataire actif en
 * collaboration active avec l'agence du bien, ou membre de son équipe ({@see ProviderEligibility}).
 *
 * Un 422 qui NOMME `assigned_to`, pas un 403 : celui qui assigne en a le droit, c'est la cible qui
 * ne convient pas. `null` (désassigner) n'est pas jugé ici.
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

        if ($user === null || ! app(ProviderEligibility::class)->isAssignable($user, $this->property)) {
            $fail(__('maintenance.errors.not_assignable'));
        }
    }
}
