<?php

namespace App\Models\Enums;

/** TCK-2388 (ADR-0077 §4) — par où le message part. `whatsapp_cloud` arrive avec TCK-2395. */
enum RadarOutreachChannel: string
{
    case WhatsappManual = 'whatsapp_manual';
}
