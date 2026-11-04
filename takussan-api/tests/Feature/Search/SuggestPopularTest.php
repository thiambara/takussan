<?php

namespace Tests\Feature\Search;

use App\Models\Enums\PropertyType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsSearchSuggestions;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2474 (ADR-0088 §4) — les recherches populaires : rendues seulement au-dessus du seuil (≥ 5 visiteurs distincts
 * un même jour, dernier nombre de résultats > 0), à saisie vide ; en complétion quand la saisie les commence.
 */
class SuggestPopularTest extends TestCase
{
    use BuildsSearchSuggestions;
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private string $url = '/api/search/suggest';

    protected function setUp(): void
    {
        parent::setUp();

        $this->publishedIn('Saly', null, ['title' => 'Villa avec piscine', 'type' => PropertyType::Villa]);
        $this->publishedIn('Saly', null, ['title' => 'Villa pieds dans l eau', 'type' => PropertyType::Villa]);
        $this->publishedIn('Dakar', null, ['title' => 'Studio meublé']);
        $this->indexProperties();

        $this->journalVisitors(6, 'villa', ['city' => 'Saly'], 2, 'a');
        $this->journalVisitors(5, 'studio', [], 1, 'b');
        $this->journalVisitors(4, 'piscine', [], 1, 'c');   // 4 visiteurs : sous le seuil
        $this->buildSuggestions();
    }

    /** AC3 — `q=` rend les seules recherches au-dessus du seuil, par popularité, et rien d'autre. */
    public function test_ac3_saisie_vide_rend_les_recherches_populaires_seules(): void
    {
        $response = $this->getJson($this->url.'?q=')->assertOk();
        $data = $response->json('data');
        // Des critères vides restent un OBJET JSON (`{}`), la forme qu'attend le front, jamais `[]`.
        $this->assertStringContainsString('{"text":"studio","criteria":{},"count":1}', $response->getContent());

        $this->assertSame([
            ['text' => 'villa', 'criteria' => ['city' => 'Saly'], 'count' => 2],
            ['text' => 'studio', 'criteria' => [], 'count' => 1],
        ], $data['popular']);
        $this->assertNull($data['interpretation']);
        foreach (['completions', 'places', 'previews', 'property_types'] as $cle) {
            $this->assertSame([], $data[$cle], $cle);
        }
        // `cities` et `neighborhoods` ont quitté la réponse (revue adverse du 2026-11-04, 4a) : les lieux sont dans `places`.
        $this->assertArrayNotHasKey('cities', $data);
        $this->assertArrayNotHasKey('neighborhoods', $data);
    }

    public function test_au_plus_six_recherches_populaires(): void
    {
        // Cinq de plus, toutes au-dessus du seuil et avec des biens (une recherche sans bien n'entre pas dans l'index).
        foreach (['villa piscine', 'villa eau', 'studio meuble', 'avec piscine', 'pieds'] as $i => $mot) {
            $this->journalVisitors(5, $mot, [], 1, 'd'.$i);
        }
        $this->buildSuggestions();

        $this->assertCount(6, $this->getJson($this->url.'?q=')->json('data.popular'));
    }

    public function test_une_saisie_commencee_rend_la_recherche_populaire_en_completion(): void
    {
        $data = $this->getJson($this->url.'?q=pisc')->json('data');

        $this->assertSame([], $data['completions'], 'piscine est sous le seuil');
        $this->assertSame([], $data['popular'], 'popular : à saisie vide seulement');

        $this->assertSame(
            [['text' => 'studio', 'criteria' => [], 'count' => 1]],
            $this->getJson($this->url.'?q=stu')->json('data.completions'),
        );
    }
}
