<?php

namespace App\Models\Enums;

/**
 * TCK-2871 — qui a annulé une visite : le visiteur (ou le client rattaché par sa fiche), ou l'agence
 * (quiconque annule au nom du bien). `null` sur une visite annulée avant la colonne.
 */
enum VisitCancelledBy: string
{
    case Visitor = 'visitor';
    case Agency = 'agency';
}
