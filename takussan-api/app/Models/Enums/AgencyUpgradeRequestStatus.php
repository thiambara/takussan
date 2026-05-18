<?php

namespace App\Models\Enums;

/**
 * TCK-252 — Lifecycle d'une AgencyUpgradeRequest.
 *
 * - `Pending`  : demande active, en attente de revue super-admin. Une seule
 *                pending autorisée par agence (index unique partiel).
 * - `Approved` : demande validée par un super-admin. Déclenche le flip
 *                `Agency.kind = standard` + unlock features (cf. TCK-269).
 * - `Rejected` : demande refusée. `review_comment` est obligatoire côté
 *                service appelant pour donner un motif au demandeur.
 * - `Revoked`  : le demandeur a annulé sa propre demande tant qu'elle était
 *                `pending` (terminal — pas de réouverture).
 */
enum AgencyUpgradeRequestStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Revoked = 'revoked';
}
