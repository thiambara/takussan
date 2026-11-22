<?php

namespace App\Models\Enums;

/**
 * TCK-2870 (ADR-0110 § 1) — comment l'acheteur finance son offre : comptant, crédit immobilier, ou
 * les deux. Chaîne en base (ADR-0007) ; le libellé appartient au front.
 */
enum OfferFinancing: string
{
    case Cash = 'cash';
    case Mortgage = 'mortgage';
    case Mixed = 'mixed';
}
