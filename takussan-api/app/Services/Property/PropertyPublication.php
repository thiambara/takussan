<?php

namespace App\Services\Property;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;

/**
 * TCK-591 (verif-591 M3) — ce que « dépublier » et « archiver » ÉCRIVENT, en un seul endroit.
 *
 * L'endpoint unitaire et le lot (`bulk-visibility`, `bulk-archive`) l'appellent tous deux : le lot
 * ne peut plus produire un état que l'unitaire ne produit jamais. Il dépubliait en ne touchant que
 * `visibility` — le bien restait « Disponible » avec sa date de publication — et archivait sans
 * effacer `published_at`.
 */
class PropertyPublication
{
    /** Les statuts d'un bien en vitrine : seuls ceux-là se dépublient (sinon 422 / `invalid_status`). */
    public const UNPUBLISHABLE = [PropertyStatus::Available, PropertyStatus::Published];

    public function canUnpublish(Property $property): bool
    {
        return in_array($property->status, self::UNPUBLISHABLE, true);
    }

    /** @return array<string, mixed> */
    public function unpublishedAttributes(): array
    {
        return [
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
        ];
    }

    /** @return array<string, mixed> */
    public function archivedAttributes(): array
    {
        return [
            'status' => PropertyStatus::Archived,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
            'archived_at' => now(),
        ];
    }

    /**
     * P147.02 (TCK-1431) — ce qu'écrit un changement de statut à la main, par `PUT …/status` ou par
     * le `PATCH` du bien : archiver écrit {@see archivedAttributes()}, sortir d'archive remet
     * `archived_at` à nul. Le `PATCH` n'écrivait que le statut : un bien archivé restait public et
     * publié, et un retour à `available` le remettait au catalogue sans republication.
     *
     * @return array<string, mixed>
     */
    public function statusAttributes(Property $property, PropertyStatus $status): array
    {
        $updates = $status === PropertyStatus::Archived ? $this->archivedAttributes() : ['status' => $status];

        if ($property->status === PropertyStatus::Archived && $status !== PropertyStatus::Archived) {
            $updates['archived_at'] = null;
        }

        return $updates;
    }
}
