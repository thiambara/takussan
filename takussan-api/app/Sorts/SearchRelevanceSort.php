<?php

namespace App\Sorts;

use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-281 — restitue l'ordre de pertinence de Meilisearch après le `whereIn`
 * qui compose Scout et Eloquent.
 *
 * `HasQueryBuilder::getAllowedQueryFilters()` intersecte les ids rendus par
 * Scout avec la requête déjà scopée du contrôleur, et `whereIn` ne dit RIEN de
 * l'ordre : `BaseModelTrait` le documentait explicitement (« Scout relevance
 * ordering is *not* preserved »). Ce tri le rétablit en projetant le RANG de
 * chaque id dans un `CASE`.
 *
 * ⚠ **Portabilité — la CONCLUSION tient, ses RAISONS ont changé (2026-08-22).**
 * Ce paragraphe invoquait MySQL et SQLite : « MySQL 8 offre `FIELD(id, …)` —
 * SQLite non, et la suite de tests tourne sur SQLite ». Les deux moteurs ont
 * disparu du dépôt avec ADR-0020, et la suite tourne sur PostgreSQL 17.
 * Re-mesuré sur le moteur réel plutôt que déduit :
 *
 *   SELECT FIELD(1,2,3);           → ERROR: function field(...) does not exist
 *   SELECT CASE 5 WHEN 5 THEN 0 …; → 0
 *   SHOW server_version;           → 17.11 (Debian 17.11-1.pgdg12+2)
 *
 * PostgreSQL n'offre pas `FIELD()` davantage que SQLite : le `CASE <col> WHEN
 * <valeur> THEN <rang> … ELSE <n> END` reste le bon choix, et il l'est
 * désormais pour un seul moteur au lieu d'être un dénominateur commun à deux.
 *
 * ⚠ **Littéraux, pas de placeholders.** Les rangs et les ids sont écrits
 * directement dans le SQL après un cast `(int)` — un entier casté ne peut rien
 * injecter. Avec des placeholders, un jeu de 5 000 ids (le plafond du callback)
 * en coûterait 10 000 de plus, en sus des 5 000 du `whereIn` : on approcherait
 * le plafond de paramètres liés du protocole PostgreSQL — **65 535**, imposé
 * par un compteur 16 bits — au lieu de s'en tenir loin. Le constructeur REJETTE tout id non entier plutôt que de
 * l'ignorer : ce tri ne s'applique qu'à des clés primaires entières, et un
 * modèle à clé non entière doit être traité explicitement, pas silencieusement
 * reclassé par date.
 */
class SearchRelevanceSort implements Sort
{
    /** @var array<int,int> Ids Scout, du plus pertinent au moins pertinent. */
    private readonly array $rankedIds;

    /**
     * @param  array<int,int|string>  $rankedIds
     */
    public function __construct(array $rankedIds)
    {
        $this->rankedIds = array_map(
            function (int|string $id): int {
                if (! is_int($id) && ! ctype_digit((string) $id)) {
                    throw new \InvalidArgumentException(
                        'SearchRelevanceSort n\'accepte que des clés primaires entières, reçu: '.var_export($id, true)
                    );
                }

                return (int) $id;
            },
            array_values($rankedIds),
        );
    }

    /**
     * @param  array<int,mixed>  $ids
     */
    public static function supports(array $ids): bool
    {
        foreach ($ids as $id) {
            if (! is_int($id) && ! (is_string($id) && ctype_digit($id))) {
                return false;
            }
        }

        return true;
    }

    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        if ($this->rankedIds === []) {
            return;
        }

        $column = $query->getModel()->getQualifiedKeyName();

        $cases = [];
        foreach ($this->rankedIds as $rank => $id) {
            $cases[] = "WHEN {$id} THEN {$rank}";
        }

        $fallbackRank = count($this->rankedIds);

        $query->orderByRaw(
            'CASE '.$column.' '.implode(' ', $cases)." ELSE {$fallbackRank} END"
            .($descending ? ' DESC' : ' ASC')
        );
    }
}
