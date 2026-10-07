<?php

namespace App\Support\Security;

use App\Http\Middleware\RequireTwoFactor;
use App\Models\Agency;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;

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

        // « Personnel de l'agence » : le prédicat de TCK-587 (ADR-0031 §1) — profil d'agent ou
        // d'admin ACTIF, ou délégation active de l'un de ces rôles. Les candidates sont les
        // agences de ses profils d'agent et de ses délégations ; le prédicat tranche.
        $candidates = $user->agentProfiles()->pluck('agency_id')
            ->merge(RoleDelegation::query()->where('user_id', $user->id)->pluck('agency_id'))
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->when($agencyId !== null, fn ($ids) => $ids->intersect([$agencyId]))
            ->values();
        if ($candidates->isEmpty()) {
            return false;
        }

        $resolver = app(MembershipCapabilityResolver::class);

        return Agency::query()
            ->whereKey($candidates->all())
            ->where('settings->require_team_two_factor', true)
            ->pluck('id')
            ->contains(fn ($id) => $resolver->isStaffAt($user, (int) $id));
    }
}
