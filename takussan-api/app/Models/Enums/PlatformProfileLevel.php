<?php

namespace App\Models\Enums;

/**
 * Niveaux du profil plateforme (TCK-278, spec §51).
 *
 * - super_admin : cross-tenant, accès complet, peut créer/révoquer d'autres
 *   PlatformProfile.
 * - support : accès lecture + actions limitées d'assistance utilisateur.
 * - viewer : lecture seule (audit / business intelligence).
 */
enum PlatformProfileLevel: string
{
    case SuperAdmin = 'super_admin';
    case Support = 'support';
    case Viewer = 'viewer';
}
