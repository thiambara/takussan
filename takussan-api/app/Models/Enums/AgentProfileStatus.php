<?php

namespace App\Models\Enums;

enum AgentProfileStatus: string
{
    // TCK-249 — profil pré-créé en draft au moment de l'envoi d'une
    // invitation. Bascule vers `Active` à l'acceptation.
    case Draft = 'draft';
    case Active = 'active';
    case Inactive = 'inactive';
    case Suspended = 'suspended';
}
