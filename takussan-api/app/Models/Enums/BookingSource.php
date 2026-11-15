<?php

namespace App\Models\Enums;

/**
 * TCK-2874 (ADR-0110 § 6) — d'où vient une réservation. Chaîne en base (ADR-0007) ; le libellé
 * appartient au front (« par le lien envoyé après la visite »).
 *
 * - `staff` : saisie par le personnel de l'agence pour son client (ADR-0102 § 2) ;
 * - `invitation` : déposée par le tunnel public ouvert depuis le lien d'invitation d'ADR-0101 § 4
 *   (`?action=reserver&via=invitation`) — un INDICE, pas un jeton : aucune autorisation n'en dépend ;
 * - `public` : déposée par le tunnel public, sans cet indice.
 */
enum BookingSource: string
{
    case Public = 'public';
    case Invitation = 'invitation';
    case Staff = 'staff';

    /** L'indice que le tunnel envoie (`via`), lu dans le corps de la requête. */
    public const VIA_INVITATION = 'invitation';

    /** La source d'une demande déposée par le client lui-même, d'après l'indice `via`. */
    public static function fromVia(mixed $via): self
    {
        return $via === self::VIA_INVITATION ? self::Invitation : self::Public;
    }
}
