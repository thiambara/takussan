<?php

namespace App\Models\Enums;

/**
 * TCK-633 (ADR-0062 §4, ADR-0062 §7) — l'état d'une entrée de référentiel proposée par un
 * utilisateur : un quartier, un équipement. Le jeu de données et le catalogue entrent `approved`.
 *
 * `pending` n'est visible que de son auteur ; `rejected` ne se montre à personne et ne se
 * repropose pas (le même nom retapé retombe sur la ligne refusée, sans en créer une autre).
 */
enum ReferentialStatus: string
{
    case Approved = 'approved';
    case Pending = 'pending';
    case Rejected = 'rejected';
}
