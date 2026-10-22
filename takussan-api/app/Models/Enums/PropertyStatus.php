<?php

namespace App\Models\Enums;

enum PropertyStatus: string
{
    case Available = 'available';
    case Sold = 'sold';
    case Rented = 'rented';
    case UnderMaintenance = 'under_maintenance';
    case Unavailable = 'unavailable';
    case Pending = 'pending';
    case Draft = 'draft';
    case Published = 'published';
    case Archived = 'archived';
    case PendingReview = 'pending_review';
    case Rejected = 'rejected';

    /**
     * P147.05 (TCK-1341) — statuts qu'aucune requête d'édition n'accepte :
     * `pending_review` et `rejected` se posent par `resubmit`, `reject` et
     * l'observateur (horodatage, motif, avis) ; `published` ne s'écrit par aucun geste.
     */
    public const NOT_SETTABLE_BY_HAND = [self::PendingReview, self::Rejected, self::Published];
}
