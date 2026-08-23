<?php

namespace Tests\Unit\Sorts;

use App\Models\Customer;
use App\Sorts\SearchRelevanceSort;
use Tests\TestCase;

/**
 * TCK-281 — le SQL de ce tri est écrit à la main, donc il n'est PAS protégé
 * par le dialecte de l'ORM. Ces tests épinglent la forme portable : un `CASE`,
 * que tout moteur SQL comprend.
 *
 * ⚠ Ce docblock justifiait la portabilité par « SQLite (la suite) et MySQL 8
 * (la production) ». Les DEUX ont été retirés par ADR-0020 : il n'y a plus qu'un
 * moteur, PostgreSQL 17, sur tous les environnements. Les tests ci-dessous
 * gardent malgré tout leur valeur — PostgreSQL n'offre pas `FIELD()` davantage
 * que SQLite ne l'offrait, et c'est justement l'intérêt d'épingler la forme
 * plutôt que le moteur. *Un test qui se justifie par un écart entre moteurs
 * survit mal à la disparition de l'écart ; celui-ci épingle une FORME.*
 */
class SearchRelevanceSortTest extends TestCase
{
    public function test_generated_sql_uses_a_portable_case_and_never_mysql_field(): void
    {
        $query = Customer::query();

        (new SearchRelevanceSort([7, 3, 11]))($query, false, 'search_relevance');

        $sql = $query->toSql();

        $this->assertStringContainsString(
            'CASE customers.id WHEN 7 THEN 0 WHEN 3 THEN 1 WHEN 11 THEN 2 ELSE 3 END ASC',
            $sql,
        );

        // `FIELD()` est une fonction MySQL, et elle n'existe NI sur PostgreSQL
        // (le moteur du dépôt depuis ADR-0020) NI sur SQLite. Le nom du test la
        // cite donc pour ce qu'elle est — une fonction propriétaire — et pas
        // parce que le dépôt viserait encore MySQL. Si quelqu'un la réintroduit,
        // ce test le dit.
        $this->assertStringNotContainsStringIgnoringCase('FIELD(', $sql);
    }

    public function test_ranked_ids_are_inlined_as_integers_not_as_bindings(): void
    {
        $query = Customer::query();

        (new SearchRelevanceSort(['7', '3']))($query, false, 'search_relevance');

        // Aucun placeholder ajouté : un jeu de 5 000 ids (le plafond du
        // callback) en coûterait 10 000 et approcherait la limite de variables
        // liées des deux moteurs.
        $this->assertSame([], $query->getBindings());
    }

    public function test_a_non_integer_key_is_refused_rather_than_silently_reordered(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        new SearchRelevanceSort(['not-an-id']);
    }

    public function test_supports_reports_whether_the_key_set_can_be_ranked(): void
    {
        $this->assertTrue(SearchRelevanceSort::supports([1, '2', 3]));
        $this->assertFalse(SearchRelevanceSort::supports([1, 'abc']));
        $this->assertFalse(SearchRelevanceSort::supports(['01f0-uuid']));
    }
}
