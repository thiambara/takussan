<?php

namespace App\Models\Enums;

/**
 * TCK-260 — lifecycle d'un ServiceProviderProfile.
 *
 *  - `draft`  : profil pré-créé au moment de l'envoi d'une invitation
 *               (avant que le User ne soit créé). Mirror Owner/Agent.
 *  - `active` : profil rattaché à au moins une agence active. Position
 *               commune après acceptation d'invitation.
 *  - `inactive` : profil sans rattachement actif (toutes les
 *                 collaborations sont `paused`/`ended`). Réservé : voir le cas.
 *  - `suspended`: profil bloqué par un admin (KYC échoué, abus, etc.).
 *                 Réservé : voir le cas.
 */
enum ServiceProviderProfileStatus: string
{
    case Draft = 'draft';
    case Active = 'active';
    /** Réservé (TCK-2043, P115.04) : aucun chemin de `app/` ne le pose ; ni la fin ni la pause d'une collaboration ne l'écrivent. */
    case Inactive = 'inactive';
    /** Réservé (TCK-2043, P115.04) : aucun chemin de `app/` ne le pose ; lu par la seule garde de fin d'onboarding. */
    case Suspended = 'suspended';
}
