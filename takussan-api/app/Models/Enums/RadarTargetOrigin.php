<?php

namespace App\Models\Enums;

/**
 * TCK-2468 (ADR-0087 §5, §6) — d'où vient une cible du Radar : l'opérateur (la console) ou la demande sans résultat
 * (TCK-2470, jamais par `POST /admin/radar/targets`).
 */
enum RadarTargetOrigin: string
{
    case Operator = 'operator';
    case Demand = 'demand';
}
