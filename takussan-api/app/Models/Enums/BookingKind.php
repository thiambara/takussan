<?php

namespace App\Models\Enums;

use App\Models\Property;

/**
 * TCK-2579 (ADR-0102) — la nature d'une réservation : un séjour payé à la nuit, une candidature à
 * une location au mois, une offre d'achat. Même table, mêmes statuts ; l'écran les sépare.
 *
 * Posée À LA CRÉATION d'après le bien ({@see self::forProperty()}) et jamais déduite à la lecture :
 * le contrat d'un bien change (vente retirée, mise en location), la réservation garde la nature
 * qu'elle avait. `metadata.kind` (tunnel public, TCK-176) est historique et n'est plus lu.
 */
enum BookingKind: string
{
    case Stay = 'stay';
    case Application = 'application';
    case Offer = 'offer';

    /**
     * La nature que le bien donne aujourd'hui : vente → offre ; location à la nuit ou à la semaine
     * → séjour ; toute autre location (au mois, à l'année, période absente) → candidature.
     *
     * ⚠ La même règle est écrite en SQL dans la migration de rattrapage
     * (`2026_11_11_130400_add_kind_to_bookings`) : `BookingKindBackfillTest` les confronte.
     */
    public static function forProperty(Property $property): self
    {
        if ($property->contract_type === ContractType::Sale) {
            return self::Offer;
        }

        return in_array($property->rent_period, [RentPeriod::Daily, RentPeriod::Weekly], true)
            ? self::Stay
            : self::Application;
    }
}
