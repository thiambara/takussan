<?php

namespace App\Models\Enums;

/**
 * TCK-2468 (ADR-0087 §5) — la portée d'une source collectée. `targeted` (le défaut) : une annonce nouvelle n'est saisie
 * que si sa carte peut correspondre à une cible active. `all` : tout ce qui est vu est saisi (ADR-0080).
 */
enum RadarCrawlScope: string
{
    case Targeted = 'targeted';
    case All = 'all';
}
