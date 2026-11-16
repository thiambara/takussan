<?php

namespace App\Models\Enums;

/**
 * TCK-2874 (ADR-0110 § 7) — le motif CODÉ d'un refus, envoyé par la feuille de décision (« Refuser
 * (motif) ») et transmis au client dans `booking.rejected` ; traduit au rendu sous
 * `bookings.rejection_reasons.<code>`. La précision saisie par le personnel part à côté, telle quelle.
 *
 * Correspondance avec les pastilles du front (`MOTIFS_DE_REFUS`, `FeuilleDeDecision.tsx`) :
 * `dossierIncomplet` → `incomplete_file`, `revenusInsuffisants` → `insufficient_income`,
 * `bienAttribue` → `property_allocated`, `offreTropBasse` → `offer_too_low`, `bienVendu` →
 * `property_sold`, `datesIndisponibles` → `dates_unavailable`, `bienIndisponible` →
 * `property_unavailable`, `autre` → `other`.
 */
enum BookingRejectionReason: string
{
    case IncompleteFile = 'incomplete_file';
    case InsufficientIncome = 'insufficient_income';
    case PropertyAllocated = 'property_allocated';
    case OfferTooLow = 'offer_too_low';
    case PropertySold = 'property_sold';
    case DatesUnavailable = 'dates_unavailable';
    case PropertyUnavailable = 'property_unavailable';
    case Other = 'other';
}
