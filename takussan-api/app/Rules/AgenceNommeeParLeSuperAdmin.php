<?php

namespace App\Rules;

use App\Models\Agency;
use App\Models\User;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-1772 (P62.07) — l'`agency_id` qu'une route laisse nommer au seul super-admin (calendrier,
 * intégration, invitation) ne se juge que pour lui.
 *
 * `exists:agencies,id` le jugeait pour tout compte connecté, avant le refus du contrôleur : une
 * agence absente rendait 422, une agence tierce le refus, et la route disait quelles agences
 * existent, hors annuaire comprises. Pour tout autre compte, le contrôleur refuse désormais
 * l'agence qui n'est pas la sienne, absente ou tierce, par la même réponse. Le super-admin garde
 * le 422 d'une agence absente ou supprimée (TCK-1338, `AgenceSupprimeeNonCibleeTest`).
 */
class AgenceNommeeParLeSuperAdmin implements ValidationRule
{
    public function __construct(private readonly ?User $user) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null || $this->user?->isSuperAdmin() !== true) {
            return;
        }

        if (! is_numeric($value) || ! Agency::query()->whereKey((int) $value)->exists()) {
            $fail('validation.exists')->translate();
        }
    }
}
