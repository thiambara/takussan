<?php

namespace App\Models\Enums;

/** TCK-2388 (ADR-0077 §4, §5) — par où le message part. */
enum RadarOutreachChannel: string
{
    /** Un lien `wa.me` ouvert par l'opérateur, envoyé depuis le téléphone dédié au Radar. */
    case WhatsappManual = 'whatsapp_manual';
    /** TCK-2395 : le gabarit Meta envoyé par l'API Cloud, depuis le numéro dédié au Radar (`config/radar_whatsapp.php`). */
    case WhatsappCloud = 'whatsapp_cloud';
}
