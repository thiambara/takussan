<?php

namespace App\Models\Enums;

/** TCK-2392 — ce qui a lancé un passage de collecte : le planificateur (`radar:crawl`) ou un opérateur. */
enum RadarCrawlTrigger: string
{
    case Schedule = 'schedule';
    case Manual = 'manual';
}
