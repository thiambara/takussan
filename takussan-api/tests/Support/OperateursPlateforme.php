<?php

namespace Tests\Support;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;

/**
 * TCK-600 (ADR-0047) — un opérateur plateforme d'un niveau donné, 2FA active, comme la console
 * l'exige à tous les niveaux. `actingAsRole('super_admin')` ne sait créer que le niveau le plus haut.
 */
trait OperateursPlateforme
{
    protected function operateur(PlatformProfileLevel $level, array $attributes = []): User
    {
        $user = User::factory()->create($attributes + [
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);
        PlatformProfile::query()->create([
            'user_id' => $user->id,
            'level' => $level,
            'granted_at' => now(),
        ]);

        return $user->fresh();
    }

    /** L'opérateur agit par un vrai jeton portant un step-up frais. */
    protected function agirEnOperateur(PlatformProfileLevel $level): User
    {
        $user = $this->operateur($level);
        $this->actingAsWithStepUp($user);

        return $user;
    }
}
