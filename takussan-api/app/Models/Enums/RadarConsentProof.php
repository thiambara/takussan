<?php

namespace App\Models\Enums;

/** TCK-2388 (ADR-0077 §3) — la nature de la preuve d'un accord. */
enum RadarConsentProof: string
{
    case Screenshot = 'screenshot';
    /** TCK-2395 : l'identifiant du message reçu par l'API du fournisseur. */
    case ProviderMessage = 'provider_message';
    /** TCK-2390 : un code à usage unique saisi sur la page de réclamation. */
    case Otp = 'otp';
}
