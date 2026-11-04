<?php

namespace Tests\Unit\Search;

use App\Services\Search\Query\InMemoryPlaceLexicon;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2473 — la correspondance des lieux, indépendante de l'ordre dans lequel les écritures arrivent (le référentiel,
 * puis les variantes de TCK-2476).
 */
class InMemoryPlaceLexiconTest extends TestCase
{
    public function test_le_plus_long_lieu_l_emporte_quel_que_soit_l_ordre(): void
    {
        $lexicon = new InMemoryPlaceLexicon([
            ['kind' => 'neighborhood', 'name' => 'Grand Yoff', 'city' => 'Dakar', 'spelling' => 'Grand Yoff'],
            ['kind' => 'neighborhood', 'name' => 'Grand Yoff Léona', 'city' => 'Dakar', 'spelling' => 'Grand Yoff Léona'],
        ]);

        $this->assertSame(
            ['kind' => 'neighborhood', 'name' => 'Grand Yoff Léona', 'city' => 'Dakar', 'length' => 3],
            $lexicon->longestMatch(['grand', 'yoff', 'leona', 'villa']),
        );
        $this->assertSame('Grand Yoff', $lexicon->longestMatch(['grand', 'yoff', 'villa'])['name'] ?? null);
    }

    public function test_la_ville_l_emporte_sur_le_quartier_homonyme_meme_arrive_apres(): void
    {
        $lexicon = new InMemoryPlaceLexicon([
            ['kind' => 'neighborhood', 'name' => 'Pikine', 'city' => 'Saint-Louis', 'spelling' => 'Pikine'],
            ['kind' => 'city', 'name' => 'Pikine', 'city' => null, 'spelling' => 'Pikine'],
        ]);

        $this->assertSame(['kind' => 'city', 'name' => 'Pikine', 'city' => null, 'length' => 1], $lexicon->longestMatch(['pikine']));
    }

    public function test_un_lieu_finit_sur_une_fin_de_mot(): void
    {
        $lexicon = new InMemoryPlaceLexicon([['kind' => 'neighborhood', 'name' => 'Sacré-Cœur', 'city' => 'Dakar', 'spelling' => 'Sacré-Cœur']]);

        $this->assertSame(1, $lexicon->longestMatch(['Sacré-Cœur'])['length'] ?? null);
        $this->assertNull($lexicon->longestMatch(['sacre']));
        $this->assertNull($lexicon->longestMatch(['sacre-coeur-ville']));
    }
}
