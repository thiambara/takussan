<?php

namespace App\Services\Review;

use App\Models\Review;
use App\Support\ContactDetails;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2672 — le risque d'un avis, règle FERMÉE et déterministe (aucune IA) : `high` dès qu'il a
 * une note de 3 ou moins (`low_rating`), au moins un signalement (`reported`), ou des coordonnées
 * dans son titre ou son texte (`contact_details`, {@see ContactDetails}) ; `low` sinon.
 *
 * Calculé, jamais stocké : la règle se lit en PHP pour une ligne ({@see self::classify()}) et en
 * SQL pour la file entière — filtre, tri et comptes ({@see self::highSql()}). Les deux sont écrites
 * à partir des mêmes seuils et des mêmes motifs ; un signalement qui arrive change le risque sans
 * qu'aucune colonne n'ait à suivre.
 */
final class ReviewRiskClassifier
{
    public const HIGH = 'high';

    public const LOW = 'low';

    public const LEVELS = [self::HIGH, self::LOW];

    public const LOW_RATING_MAX = 3;

    /** @return array{level: string, reasons: list<string>} */
    public function classify(Review $review): array
    {
        $reasons = [];
        if ($review->rating !== null && (int) $review->rating <= self::LOW_RATING_MAX) {
            $reasons[] = 'low_rating';
        }
        if ((int) ($review->reported_count ?? 0) > 0) {
            $reasons[] = 'reported';
        }
        if (ContactDetails::found(trim(($review->title ?? '').' '.($review->content ?? '')))) {
            $reasons[] = 'contact_details';
        }

        return ['level' => $reasons === [] ? self::LOW : self::HIGH, 'reasons' => $reasons];
    }

    /**
     * Le prédicat « à risque » sur la table `reviews` : `[$sql, $bindings]`.
     *
     * @return array{0: string, 1: list<string|int>}
     */
    public static function highSql(): array
    {
        [$contact, $bindings] = ContactDetails::sql("coalesce(reviews.title, '') || ' ' || coalesce(reviews.content, '')");

        return [
            '(reviews.rating <= ? OR coalesce(reviews.reported_count, 0) > 0 OR '.$contact.')',
            [self::LOW_RATING_MAX, ...$bindings],
        ];
    }

    /**
     * Reprise de TCK-2722 — le risque n'est lu que sur un avis que le lecteur modère : pour une
     * file bornée (`$amongTypes`, les types que l'agence modère), un avis hors de ces types n'est ni
     * « à risque » ni « sans risque » (la ressource lui retire `risk`). `[$haut, $bas, $bindings des
     * deux]` ; sans borne, `bas` est la négation de `haut`.
     *
     * @param  list<string>|null  $amongTypes
     * @return array{0: string, 1: string, 2: list<string|int>, 3: list<string|int>}
     */
    private static function levelsSql(?array $amongTypes): array
    {
        [$sql, $bindings] = self::highSql();
        if ($amongTypes === null) {
            return [$sql, "NOT {$sql}", $bindings, $bindings];
        }

        $in = 'reviews.reviewable_type IN ('.implode(', ', array_fill(0, count($amongTypes), '?')).')';

        return ["({$in} AND {$sql})", "({$in} AND NOT {$sql})", [...$amongTypes, ...$bindings], [...$amongTypes, ...$bindings]];
    }

    /**
     * @param  Builder<Review>  $query
     * @param  list<string>|null  $amongTypes  {@see self::levelsSql()}
     * @return Builder<Review>
     */
    public static function whereLevel(Builder $query, string $level, ?array $amongTypes = null): Builder
    {
        [$high, $low, $highBindings, $lowBindings] = self::levelsSql($amongTypes);

        return $level === self::HIGH
            ? $query->whereRaw($high, $highBindings)
            : $query->whereRaw($low, $lowBindings);
    }

    /**
     * Les deux comptes sur la file telle qu'elle est filtrée, AVANT le filtre de risque.
     *
     * @param  Builder<Review>  $query
     * @param  list<string>|null  $amongTypes  {@see self::levelsSql()}
     * @return array{high: int, low: int}
     */
    public static function counts(Builder $query, ?array $amongTypes = null): array
    {
        [$high, $low, $highBindings, $lowBindings] = self::levelsSql($amongTypes);
        $row = $query->clone()->toBase()->reorder()
            ->selectRaw("count(*) filter (where {$high}) as high, count(*) filter (where {$low}) as low", [...$highBindings, ...$lowBindings])
            ->first();

        return ['high' => (int) ($row->high ?? 0), 'low' => (int) ($row->low ?? 0)];
    }

    /**
     * `sort=risk` : les avis à risque d'abord ; `sort=-risk` : les sans risque d'abord.
     *
     * @param  Builder<Review>  $query
     * @param  list<string>|null  $amongTypes  {@see self::levelsSql()} — hors des types, rangé avec les sans risque
     * @return Builder<Review>
     */
    public static function orderBy(Builder $query, string $direction, ?array $amongTypes = null): Builder
    {
        [$high, , $bindings] = self::levelsSql($amongTypes);

        return $query->orderByRaw("CASE WHEN {$high} THEN 0 ELSE 1 END ".($direction === 'desc' ? 'desc' : 'asc'), $bindings);
    }
}
