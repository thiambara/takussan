<?php

namespace App\Services\Dashboard;

/**
 * TCK-595 — le périmètre d'un portefeuille : les biens d'un bailleur, ou ceux d'une agence.
 *
 * Il porte, pour chaque table que lit {@see PortfolioMetrics}, la colonne qui le borne. Le bailleur
 * se lit par `properties.user_id`, `leases.landlord_id` et `payouts.landlord_id`, l'agence par
 * `agency_id` partout. Un calcul écrit une fois sert les deux tableaux de bord : c'est ce qui garantit
 * qu'un même jeu de données y rend les mêmes chiffres (AC5).
 */
final class PortfolioScope
{
    private function __construct(
        public readonly string $propertyColumn,
        public readonly string $leaseColumn,
        public readonly string $payoutColumn,
        public readonly int $id,
    ) {}

    public static function landlord(int $userId): self
    {
        return new self('user_id', 'landlord_id', 'landlord_id', $userId);
    }

    public static function agency(int $agencyId): self
    {
        return new self('agency_id', 'agency_id', 'agency_id', $agencyId);
    }
}
