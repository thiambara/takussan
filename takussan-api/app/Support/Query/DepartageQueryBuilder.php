<?php

namespace App\Support\Query;

use Spatie\QueryBuilder\QueryBuilder;

/**
 * TCK-1296 (P118.02, P118.03) — le `QueryBuilder` de spatie dont la pagination rend un ORDRE TOTAL.
 *
 * Une liste triée sur une colonne qui se partage (`created_at` en `timestamp(0)`, une date
 * calendaire, un statut) n'a pas d'ordre fixé entre deux lignes égales : sous PostgreSQL, deux
 * pages successives peuvent rendre deux fois la même ligne et jamais une autre, sans que rien ne
 * rougisse (mesuré : 150 factures de même seconde, un tiers mises à jour, 10 pages de 15 → 147
 * distinctes). Le défaut apparaît avec la vie normale des lignes, qui déplace leur ordre physique.
 *
 * Juste avant `paginate()` / `simplePaginate()`, la clé primaire qualifiée est ajoutée EN DERNIER
 * tri, dans le sens du dernier tri posé. Elle ne change donc que l'ordre des lignes égales sur
 * tout ce qui précède — tri par défaut ou `sort=` explicite, que spatie applique dès
 * `defaultSort()` / `allowedSorts()`.
 *
 * Rien n'est ajouté quand :
 * - la requête n'a aucun tri (l'ordre par défaut d'une liste se décide dans son contrôleur) ;
 * - la clé primaire est déjà triée, à n'importe quel rang ;
 * - la requête porte un `GROUP BY`, un `DISTINCT` ou une `UNION`, où PostgreSQL refuserait un
 *   `ORDER BY` sur une colonne hors du groupe ou de la sélection.
 */
class DepartageQueryBuilder extends QueryBuilder
{
    private const PAGINATIONS = ['paginate', 'simplePaginate'];

    public function __call(string $name, array $arguments): mixed
    {
        if (in_array($name, self::PAGINATIONS, true)) {
            $this->departager();
        }

        return parent::__call($name, $arguments);
    }

    public function departager(): static
    {
        $eloquent = $this->getEloquentBuilder();
        $base = $eloquent->getQuery();
        $cle = $eloquent->getModel()->getKeyName();

        if (empty($base->orders) || ! is_string($cle) || ! empty($base->groups)
            || $base->distinct !== false || ! empty($base->unions)) {
            return $this;
        }

        $qualifiee = $eloquent->getModel()->getQualifiedKeyName();

        foreach ($base->orders as $tri) {
            if (in_array($tri['column'] ?? null, [$cle, $qualifiee], true)) {
                return $this;
            }
        }

        $dernier = end($base->orders);
        // Un tri brut (rang d'enum, pertinence) n'a pas de `direction` : son sens se lit à la fin du SQL.
        $sens = isset($dernier['direction'])
            ? (strtolower((string) $dernier['direction']) === 'desc' ? 'desc' : 'asc')
            : (preg_match('/\bdesc\s*$/i', (string) ($dernier['sql'] ?? '')) === 1 ? 'desc' : 'asc');

        $eloquent->orderBy($qualifiee, $sens);

        return $this;
    }
}
