<?php

namespace App\Models\Enums;

/**
 * Granular inventory element state (per-item within a room).
 *
 * Distinct from `InventoryCondition` (which grades a whole property or room
 * on a global scale excellent/good/fair/poor); element states describe the
 * usable condition of individual items like "Canapé", "Four", "Robinet".
 * Values stay in French to match the UI vocabulary used with tenants.
 */
enum InventoryElementState: string
{
    case Bon = 'bon';
    case Use = 'usé';
    case Endommage = 'endommagé';
    case Manquant = 'manquant';
}
