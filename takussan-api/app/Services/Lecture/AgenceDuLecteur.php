<?php

namespace App\Services\Lecture;

use App\Models\User;

/**
 * TCK-3006 (ADR-0138 § 5) — la branche « personnel de l'agence » des modules `<Modèle>Lisibles`,
 * écrite une fois pour ses deux faces : en SQL, `where('agency_id', $user->staffAgencyId())` ; en
 * PHP, {@see self::personnel()}. L'agence qui compte est celle du PROFIL ACTIF (ADR-0004,
 * ADR-0031 § 1) : un personnel de deux agences ne lit, par cette branche, que celle où il agit.
 *
 * C'est la règle de `BasePolicy::isStaffOf`, que les modules ne peuvent pas appeler (protégée, et
 * d'instance) ; elle ne change rien à ce que les policies jugeaient.
 */
final class AgenceDuLecteur
{
    public static function personnel(User $user, mixed $agencyId): bool
    {
        if ($agencyId === null) {
            return false;
        }

        $staffAgencyId = $user->staffAgencyId();

        return $staffAgencyId !== null && $staffAgencyId === (int) $agencyId;
    }
}
