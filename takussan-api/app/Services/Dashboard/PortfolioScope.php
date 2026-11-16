<?php

namespace App\Services\Dashboard;

use App\Services\Property\BailleurDuBien;
use Illuminate\Contracts\Database\Eloquent\Builder;

/**
 * TCK-595 — le périmètre d'un portefeuille : les biens d'un bailleur, ou ceux d'une agence.
 *
 * Il porte, pour chaque table que lit {@see PortfolioMetrics}, la colonne qui le borne. Le bailleur
 * se lit par `properties.user_id`, `leases.landlord_id` et `payouts.landlord_id`, l'agence par
 * `agency_id` partout. Un calcul écrit une fois sert les deux tableaux de bord : c'est ce qui garantit
 * qu'un même jeu de données y rend les mêmes chiffres (AC5).
 *
 * TCK-2275 (P232.01, P232.06 ; ADR-0031, amendement du 2026-10-25, D1) — pour le bailleur, les
 * colonnes des biens et des baux ne le désignent que selon {@see BailleurDuBien} : la ligne est sans
 * agence, ou il détient un profil propriétaire dans son agence. L'agent qui a saisi un bien d'agence
 * en est le `user_id`, et son bail le recopie en `landlord_id` : sans cette borne, son tableau de
 * bord comptait ce bien, ses loyers et ses impayés. `payouts.landlord_id` reste lu tel quel : il
 * nomme le bénéficiaire d'un reversement, que juge la règle du reversement (P232.07, TCK-997).
 */
final class PortfolioScope
{
    private function __construct(
        public readonly string $propertyColumn,
        public readonly string $leaseColumn,
        public readonly string $payoutColumn,
        public readonly int $id,
        private readonly bool $bailleur = false,
        private readonly ?int $agence = null,
    ) {}

    public static function landlord(int $userId): self
    {
        return new self('user_id', 'landlord_id', 'landlord_id', $userId, bailleur: true);
    }

    public static function agency(int $agencyId): self
    {
        return new self('agency_id', 'agency_id', 'agency_id', $agencyId);
    }

    /**
     * TCK-2847 — le même périmètre, borné en plus à UNE agence : la ligne d'activité d'un espace de
     * bailleur ne compte que les biens et les baux de l'agence de ce profil. La borne s'ajoute à
     * {@see self::properties()}, {@see self::leases()} et {@see self::propertiesSql()} — jamais aux
     * colonnes lues en direct (`payoutColumn`).
     */
    public function dansLAgence(int $agencyId): self
    {
        return new self($this->propertyColumn, $this->leaseColumn, $this->payoutColumn, $this->id, $this->bailleur, $agencyId);
    }

    /** Les biens du périmètre, sur une requête qui lit `properties` (ou une jointure qualifiée). */
    public function properties(Builder $query, string $table = 'properties'): Builder
    {
        return $this->borner($query, $table, $this->propertyColumn);
    }

    /** Les baux du périmètre, sur une requête qui lit `leases` (ou une jointure qualifiée). */
    public function leases(Builder $query, string $table = 'leases'): Builder
    {
        return $this->borner($query, $table, $this->leaseColumn);
    }

    /**
     * La même borne des biens pour le SQL brut, sur l'alias `$alias` de `properties`.
     *
     * @return array{0: string, 1: list<mixed>}
     */
    public function propertiesSql(string $alias): array
    {
        $sql = "{$alias}.{$this->propertyColumn} = ?";
        $bindings = [$this->id];
        // TCK-2847 — la borne d'agence de `dansLAgence()`.
        if ($this->agence !== null) {
            $sql .= " AND {$alias}.agency_id = ?";
            $bindings[] = $this->agence;
        }
        if (! $this->bailleur) {
            return [$sql, $bindings];
        }

        $agences = BailleurDuBien::agences($this->id);

        return [
            "{$sql} AND ({$alias}.agency_id IS NULL OR {$alias}.agency_id IN ({$agences->toSql()}))",
            [...$bindings, ...$agences->getBindings()],
        ];
    }

    private function borner(Builder $query, string $table, string $column): Builder
    {
        $borne = $this->bailleur
            ? BailleurDuBien::restreindre($query, $this->id, "{$table}.{$column}", "{$table}.agency_id")
            : $query->where("{$table}.{$column}", $this->id);

        // TCK-2847 — la borne d'agence de `dansLAgence()`.
        return $this->agence !== null ? $borne->where("{$table}.agency_id", $this->agence) : $borne;
    }
}
