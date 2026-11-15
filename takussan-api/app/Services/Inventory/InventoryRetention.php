<?php

namespace App\Services\Inventory;

use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Inventory;
use App\Models\Lease;

/**
 * TCK-2646 — les retenues sur caution proposées par une sortie : `retention_amount` (décimal XOF,
 * ≥ 0) et `retention_reason` sur ses éléments.
 *
 * Une retenue n'est qu'une PROPOSITION, jamais un débit : la restitution reste le geste existant
 * (`DepositRefundService`), bornée par la caution encaissée (TCK-2375). La restitution lit
 * {@see proposedFor()} pour préremplir le montant retenu.
 */
final class InventoryRetention
{
    /**
     * La somme des retenues des éléments d'une sortie ; `null` pour une entrée.
     *
     * @param  array<int, mixed>|null  $rooms
     */
    public static function total(?InventoryType $type, ?array $rooms): ?float
    {
        if ($type !== InventoryType::MoveOut) {
            return null;
        }

        $total = 0.0;
        foreach ($rooms ?? [] as $room) {
            foreach (is_array($room) && is_array($room['elements'] ?? null) ? $room['elements'] : [] as $element) {
                $amount = is_array($element) ? ($element['retention_amount'] ?? null) : null;
                if (is_numeric($amount) && (float) $amount > 0) {
                    $total += (float) $amount;
                }
            }
        }

        return round($total, 2);
    }

    /**
     * La retenue proposée pour un bail : celle de sa dernière sortie SIGNÉE (une sortie contestée ou
     * encore à signer ne propose rien).
     *
     * @return array{proposed_retention: float|null, proposed_retention_inventory_id: int|null}
     */
    public static function proposedFor(Lease $lease): array
    {
        $exit = Inventory::query()
            ->where('lease_id', $lease->id)
            ->where('type', InventoryType::MoveOut->value)
            ->where('status', InventoryStatus::Signed->value)
            ->orderByDesc('signed_at')
            ->orderByDesc('id')
            ->first(['id', 'type', 'rooms']);

        return [
            'proposed_retention' => $exit === null ? null : self::total($exit->type, $exit->rooms),
            'proposed_retention_inventory_id' => $exit?->id,
        ];
    }
}
