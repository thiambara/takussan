<?php

namespace App\Support\Security;

use App\Http\Middleware\RequireTwoFactor;
use App\Models\Agency;
use App\Models\User;

/**
 * TCK-589 — QUI doit porter la 2FA (ADR-0033, contrainte 7) : tout profil
 * plateforme, tout admin d'agence, et le personnel d'une agence qui a coché
 * `settings.require_team_two_factor`. Jamais un bailleur, jamais un client.
 *
 * Lu par {@see RequireTwoFactor} (où l'exiger) et par
 * `TwoFactorController::disable` (ce qui ne se désactive pas, contrainte 10).
 */
final class TwoFactorRequirement
{
    /** La 2FA est-elle exigée de ce compte, quelque part ? */
    public static function isMandatory(User $user): bool
    {
        return $user->platformProfile()->exists()
            || self::requiredAtAgency($user, null);
    }

    /**
     * Exigée pour une action d'agence : admin d'agence où que ce soit, ou
     * personnel de `$agencyId` (de n'importe laquelle de ses agences si `null`)
     * quand l'agence l'a exigé de son équipe.
     */
    public static function requiredAtAgency(User $user, ?int $agencyId): bool
    {
        if ($user->agencyAdminProfiles()->exists()) {
            return true;
        }

        // TCK-587 — « personnel de l'agence » = agent OU admin (`isAgentAt ||
        // isAgencyAdminAt`), en attendant le prédicat que 587 nommera.
        $staffAgencyIds = $user->agentProfiles()->pluck('agency_id')->map(fn ($id) => (int) $id)->all();
        if ($agencyId !== null) {
            $staffAgencyIds = array_values(array_intersect($staffAgencyIds, [$agencyId]));
        }

        return $staffAgencyIds !== [] && Agency::query()
            ->whereKey($staffAgencyIds)
            ->where('settings->require_team_two_factor', true)
            ->exists();
    }
}
