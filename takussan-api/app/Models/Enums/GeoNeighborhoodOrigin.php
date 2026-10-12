<?php

namespace App\Models\Enums;

/** TCK-633 — d'où vient un quartier : le jeu de données versionné, ou une saisie. */
enum GeoNeighborhoodOrigin: string
{
    case Dataset = 'dataset';
    case User = 'user';
}
