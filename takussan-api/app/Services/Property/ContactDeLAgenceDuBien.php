<?php

namespace App\Services\Property;

use App\Models\Customer;
use App\Models\Guarantor;
use App\Policies\GuarantorPolicy;

/**
 * TCK-2285 (P226.01, décision du porteur du 2026-10-25, ADR-0031 amendement du 2026-10-25) — le
 * locataire, le garant et le client d'un bail ou d'une réservation sont des fiches de l'agence du
 * bien quand le bien a une agence. La règle s'ajoute à `can('view')`, qui ne lit que l'agence de la
 * fiche : un agent de A et de B rattachait au bien de B la fiche de A qu'il avait ajoutée, et le
 * personnel de B la lisait ensuite par le bail.
 *
 * Un bien sans agence ne change pas : `can('view')` seul (`ClientDeLAgence`, qui refuse toute fiche
 * sur un tel bien, n'est pas repris).
 */
final class ContactDeLAgenceDuBien
{
    public static function client(Customer $customer, mixed $agencyIdDuBien): bool
    {
        return self::memeAgence($customer->agency_id, $agencyIdDuBien);
    }

    /** L'agence d'un garant se lit comme sa policy la lit ({@see GuarantorPolicy::agencyOf()}). */
    public static function garant(Guarantor $guarantor, mixed $agencyIdDuBien): bool
    {
        return self::memeAgence(GuarantorPolicy::agencyOf($guarantor), $agencyIdDuBien);
    }

    private static function memeAgence(mixed $agencyIdDeLaFiche, mixed $agencyIdDuBien): bool
    {
        return $agencyIdDuBien === null
            || ($agencyIdDeLaFiche !== null && (int) $agencyIdDeLaFiche === (int) $agencyIdDuBien);
    }
}
