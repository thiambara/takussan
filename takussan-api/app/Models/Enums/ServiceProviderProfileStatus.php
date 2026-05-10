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
 *                 collaborations sont `paused`/`ended`).
 *  - `suspended`: profil bloqué par un admin (KYC échoué, abus, etc.).
 */
enum ServiceProviderProfileStatus: string
{
    case Draft = 'draft';
    case Active = 'active';
    case Inactive = 'inactive';
    case Suspended = 'suspended';
}
