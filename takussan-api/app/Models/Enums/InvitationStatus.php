<?php

namespace App\Models\Enums;

/**
 * TCK-249 — état du lifecycle d'une Invitation.
 *
 * - `Sent`     : invitation émise, token actif, expires_at futur.
 * - `Accepted` : destinataire a complété l'acceptation (User créé / role
 *                attaché / profil flippé).
 * - `Expired`  : `expires_at` dépassé sans acceptation. Le cron horaire
 *                `invitations:expire` flippe sent → expired.
 * - `Revoked`  : l'inviteur a annulé l'invitation avant acceptation.
 */
enum InvitationStatus: string
{
    case Sent = 'sent';
    case Accepted = 'accepted';
    case Expired = 'expired';
    case Revoked = 'revoked';
}
