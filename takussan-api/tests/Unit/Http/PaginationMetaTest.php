<?php

namespace Tests\Unit\Http;

use App\Http\Responses\PaginationMeta;
use Illuminate\Pagination\LengthAwarePaginator;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Le point qui fait foi pour l'enveloppe de pagination (TCK-304).
 *
 * Ces tests portent le CONTRAT que 57 contrôleurs recopiaient chacun à sa façon. Ils sont ici
 * plutôt que dans un test d'API parce qu'ils doivent pouvoir échouer sans base de données : un
 * contrat qui n'est vérifiable qu'en traversant l'application n'est pas un contrat, c'est une
 * observation.
 */
#[CoversClass(PaginationMeta::class)]
final class PaginationMetaTest extends TestCase
{
    private function paginator(int $total, int $perPage, int $page): LengthAwarePaginator
    {
        return new LengthAwarePaginator(array_fill(0, min($perPage, max(0, $total)), ['id' => 1]), $total, $perPage, $page);
    }

    public function test_it_emits_exactly_the_four_canonical_keys(): void
    {
        $meta = PaginationMeta::from($this->paginator(total: 42, perPage: 20, page: 2));

        $this->assertSame(['total', 'per_page', 'current_page', 'last_page'], array_keys($meta));
        $this->assertSame(['total' => 42, 'per_page' => 20, 'current_page' => 2, 'last_page' => 3], $meta);
    }

    public function test_the_key_list_constant_matches_what_is_emitted(): void
    {
        // Si la constante et la sortie divergent, la garde CI et le code décrivent deux formes
        // différentes — et c'est la constante que lira le prochain.
        $this->assertSame(
            PaginationMeta::KEYS,
            array_keys(PaginationMeta::from($this->paginator(total: 1, perPage: 15, page: 1)))
        );
    }

    public function test_extra_keys_are_appended_after_the_canonical_ones(): void
    {
        $meta = PaginationMeta::from(
            $this->paginator(total: 5, perPage: 20, page: 1),
            ['pending_count' => 3, 'unread' => 1],
        );

        $this->assertSame(
            ['total', 'per_page', 'current_page', 'last_page', 'pending_count', 'unread'],
            array_keys($meta),
        );
        $this->assertSame(3, $meta['pending_count']);
    }

    /**
     * L'invariant qui justifie la garde : le paginateur fait foi. Un endpoint ne peut pas
     * réintroduire la divergence en glissant sa propre valeur dans `extra`.
     */
    public function test_a_canonical_key_passed_as_extra_cannot_override_the_paginator(): void
    {
        $meta = PaginationMeta::from(
            $this->paginator(total: 42, perPage: 20, page: 2),
            ['total' => 999, 'last_page' => 1, 'pending_count' => 7],
        );

        $this->assertSame(42, $meta['total']);
        $this->assertSame(3, $meta['last_page']);
        $this->assertSame(7, $meta['pending_count']);
    }

    public function test_it_builds_from_raw_counters_when_there_is_no_eloquent_paginator(): void
    {
        // Le cas Meilisearch : `PropertySearchService` n'a pas de paginateur à donner.
        $meta = PaginationMeta::of(total: 250, perPage: 24, currentPage: 3, lastPage: 11);

        $this->assertSame(['total' => 250, 'per_page' => 24, 'current_page' => 3, 'last_page' => 11], $meta);
    }

    public function test_it_derives_last_page_when_the_caller_has_none(): void
    {
        $this->assertSame(5, PaginationMeta::of(total: 41, perPage: 10, currentPage: 1)['last_page']);
        $this->assertSame(4, PaginationMeta::of(total: 40, perPage: 10, currentPage: 1)['last_page']);
    }

    /**
     * Une liste vide reste une liste : `last_page` vaut 1, jamais 0. Une page « 1 sur 0 » n'existe
     * pas, et le front en tire des bornes de navigation.
     */
    public function test_an_empty_list_still_has_a_last_page_of_one(): void
    {
        $this->assertSame(1, PaginationMeta::of(total: 0, perPage: 20, currentPage: 1)['last_page']);
        $this->assertSame(1, PaginationMeta::from($this->paginator(total: 0, perPage: 20, page: 1))['last_page']);
    }

    public function test_a_per_page_of_zero_does_not_divide_by_zero(): void
    {
        $this->assertSame(1, PaginationMeta::of(total: 10, perPage: 0, currentPage: 1)['last_page']);
    }

    public function test_the_four_values_are_integers(): void
    {
        // `perPage()` rend une string quand elle vient d'un `?per_page=20` non casté : le point
        // canonique normalise, sinon le front reçoit "20" ici et 20 ailleurs.
        $meta = PaginationMeta::from(new LengthAwarePaginator([], 0, '25', 1));

        foreach (PaginationMeta::KEYS as $cle) {
            $this->assertIsInt($meta[$cle], "meta.$cle doit être un entier");
        }
    }
}
