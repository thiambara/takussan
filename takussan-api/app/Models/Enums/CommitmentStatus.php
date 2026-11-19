<?php

namespace App\Models\Enums;

use App\Models\Commitment;

/**
 * TCK-2969 (ADR-0130 § 1) — le statut STOCKÉ d'un engagement. « En retard » n'en est pas un : c'est
 * `open` et `due_at` passé, jugé à l'instant ({@see Commitment::etat()}).
 */
enum CommitmentStatus: string
{
    /** Noté par le personnel pour un autre que lui : attend la confirmation du porteur. */
    case Proposed = 'proposed';
    case Open = 'open';
    case Kept = 'kept';
    case Cancelled = 'cancelled';

    /** Les statuts d'un engagement en cours : ce qu'annulent un geste ou la clôture de son objet. */
    public const EN_COURS = [self::Proposed, self::Open];
}
