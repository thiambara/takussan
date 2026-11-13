<?php

namespace App\Models\Enums;

enum OwnerProfileStatus: string
{
    // TCK-249 — profil pré-créé en draft au moment de l'envoi d'une
    // invitation. Bascule vers `Active` à l'acceptation.
    case Draft = 'draft';
    case Active = 'active';
    case Inactive = 'inactive';
    case Blocked = 'blocked';

    /**
     * TCK-2753 (ADR-0108 § 5) — les statuts où le bailleur garde la LECTURE de ce qui le désigne
     * (`BailleurDuBien`, de tout statut) mais n'ÉCRIT plus rien dans l'agence : suspendu (`blocked`,
     * TCK-587) ou parti (`inactive`, le départ). La seule définition de la garde d'écriture du
     * bailleur, lue par `HasProfiles::isBlockedOwnerAt()` et par son amorce
     * (`MembershipCapabilityResolver::amorce('blocked_owner')`).
     *
     * @return list<self>
     */
    public static function sansEcriture(): array
    {
        return [self::Blocked, self::Inactive];
    }

    /** @return list<string> les valeurs de {@see self::sansEcriture()} */
    public static function valeursSansEcriture(): array
    {
        return array_map(fn (self $s): string => $s->value, self::sansEcriture());
    }
}
