<?php

namespace App\Models\Enums;

/**
 * TCK-2873 (ADR-0110 § 5) — l'état d'une contre-offre de l'agence sur une offre d'achat. Chaîne en
 * base (ADR-0007) ; le libellé appartient au front.
 *
 * - `pending` : proposée, le client n'a pas répondu ;
 * - `accepted` : le client l'a acceptée — l'offre prend son montant et passe `confirmed` ;
 * - `declined` : le client l'a déclinée — l'offre reste en attente à son montant d'origine ;
 * - `superseded` : une contre-offre plus récente l'a remplacée ;
 * - `expired` : non répondue à `valid_until` (tâche d'expiration des réservations).
 */
enum CounterOfferStatus: string
{
    case Pending = 'pending';
    case Accepted = 'accepted';
    case Declined = 'declined';
    case Superseded = 'superseded';
    case Expired = 'expired';
}
