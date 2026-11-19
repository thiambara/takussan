<?php

namespace App\Services\Pont;

/** TCK-2980 (ADR-0132 § 3) — l'accord d'un numéro sur un canal. */
enum EtatDAccord: string
{
    case Inconnu = 'pending';
    case Accorde = 'opted_in';
    case Oppose = 'opted_out';
}
