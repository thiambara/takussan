<?php

namespace App\Domain\Notifications;

/**
 * TCK-2633 — les familles de la cloche, fermées (celles de la maquette de la famille 3 de l'audit
 * UX) : le front n'en porte que l'icône et le ton, et lit `famille` sur chaque notification.
 * Le rangement de chaque code vit dans {@see NotificationClassification}, et nulle part ailleurs.
 */
enum NotificationFamily: string
{
    case Demande = 'demande';
    case Visite = 'visite';
    case Paiement = 'paiement';
    case Retard = 'retard';
    case Bien = 'bien';
    case Avis = 'avis';
    case Systeme = 'systeme';
}
