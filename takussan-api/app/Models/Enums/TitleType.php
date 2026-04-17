<?php

namespace App\Models\Enums;

enum TitleType: string
{
    case Bail = 'bail';
    case TitreFoncier = 'titre_foncier';
    case Deliberation = 'deliberation';
    case Autre = 'autre';
}
