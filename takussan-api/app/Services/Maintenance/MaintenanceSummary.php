<?php

namespace App\Services\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;

/**
 * TCK-2906 — `maintenance_summary { total, open, latest_open { id, title, status } }` de la fiche d'un
 * bien (`include=maintenanceSummary`) et du dossier d'un bail (`include=maintenance_summary`).
 *
 * Même portée que `GET /api/maintenance-requests` : {@see MaintenanceRequest::scopeVisibleTo()} — le
 * lecteur ne compte que ce qu'il lit, jamais une demande d'une autre agence. « Ouverte » est LE prédicat
 * des tableaux de bord ({@see MaintenanceRequest::scopeOpen()}) : tout état hors
 * {@see MaintenanceRequest::FINISHED_STATUSES}. La dernière ouverte : la plus récemment créée, l'id en
 * départage. `status` est la valeur de l'enum : le front porte les libellés.
 *
 * Un agrégat, une requête, quel que soit le nombre de cibles.
 */
final class MaintenanceSummary
{
    /**
     * @param  list<int>  $propertyIds
     * @return array<int, array{total: int, open: int, latest_open: array{id: int, title: string|null, status: string|null}|null}>
     */
    public static function byProperty(User $viewer, array $propertyIds): array
    {
        return self::by('property_id', $viewer, $propertyIds);
    }

    /**
     * @param  list<int>  $leaseIds
     * @return array<int, array{total: int, open: int, latest_open: array{id: int, title: string|null, status: string|null}|null}>
     */
    public static function byLease(User $viewer, array $leaseIds): array
    {
        return self::by('lease_id', $viewer, $leaseIds);
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, array{total: int, open: int, latest_open: array{id: int, title: string|null, status: string|null}|null}>
     */
    private static function by(string $column, User $viewer, array $ids): array
    {
        $out = [];
        foreach ($ids as $id) {
            $out[(int) $id] = ['total' => 0, 'open' => 0, 'latest_open' => null];
        }
        if ($ids === []) {
            return $out;
        }

        $finished = array_map(static fn (MaintenanceStatus $s): string => $s->value, MaintenanceRequest::FINISHED_STATUSES);
        $holes = implode(', ', array_fill(0, count($finished), '?'));
        $isOpen = "maintenance_requests.status NOT IN ({$holes})";
        $order = 'ORDER BY maintenance_requests.created_at DESC, maintenance_requests.id DESC';

        $rows = MaintenanceRequest::query()
            ->visibleTo($viewer)
            ->whereIn("maintenance_requests.{$column}", $ids)
            ->toBase()
            ->select("maintenance_requests.{$column} as cible")
            ->selectRaw('COUNT(*) AS total')
            ->selectRaw("COUNT(*) FILTER (WHERE {$isOpen}) AS open", $finished)
            ->selectRaw("(ARRAY_AGG(maintenance_requests.id {$order}) FILTER (WHERE {$isOpen}))[1] AS latest_id", $finished)
            ->selectRaw("(ARRAY_AGG(maintenance_requests.title {$order}) FILTER (WHERE {$isOpen}))[1] AS latest_title", $finished)
            ->selectRaw("(ARRAY_AGG(maintenance_requests.status {$order}) FILTER (WHERE {$isOpen}))[1] AS latest_status", $finished)
            ->groupBy("maintenance_requests.{$column}")
            ->get();

        foreach ($rows as $row) {
            $out[(int) $row->cible] = [
                'total' => (int) $row->total,
                'open' => (int) $row->open,
                'latest_open' => $row->latest_id === null ? null : [
                    'id' => (int) $row->latest_id,
                    'title' => $row->latest_title,
                    'status' => $row->latest_status,
                ],
            ];
        }

        return $out;
    }
}
