<?php

namespace App\Services\Payout;

use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;

/**
 * TCK-997 (P50.02, Q1 ; P232.07, porteur 2026-10-25 ; ADR-0036, amendement du 2026-10-25) — LA règle
 * du bénéficiaire d'un reversement dans une agence, écrite une fois. Le reversement
 * (`PayoutService::create`, `PayoutPreparationService::prepare`), le relevé de gérance
 * (`OwnerStatementPolicy::view`), l'avis mensuel (`SendOwnerStatements`) et l'effacement d'un compte
 * (`AccountDeletionService::agenciesOwingPayout`) la lisent tous : pour un même bien, celui à qui le
 * loyer se reverse est celui dont le relevé se lit et à qui l'avis part.
 *
 *  - **Le bailleur** : un profil propriétaire dans l'agence, de TOUT statut — c'est son argent, le
 *    bailleur bloqué le touche (appartenance, TCK-587). Un compte effacé n'a plus de profil : il
 *    n'est plus bénéficiaire, et seul son relevé reste lisible (TCK-2015, `OwnerStatementPolicy`).
 *  - **Le personnel**, pour un bien que l'agence garde en propre (Q1) : un profil ACTIF d'agent ou
 *    d'admin d'agence, ou une délégation en vigueur (`isStaffAt`). Un profil non actif ne confère
 *    rien (ADR-0031 § 3) : les loyers d'un bien gardé par un agent suspendu attendent sa
 *    réactivation, ou un changement de titulaire (TCK-999).
 */
final class BeneficiaireDuReversement
{
    public static function est(User $beneficiaire, int $agencyId): bool
    {
        return $beneficiaire->hasProfileAt($agencyId, OwnerProfile::class)
            || app(MembershipCapabilityResolver::class)->isStaffAt($beneficiaire, $agencyId);
    }
}
