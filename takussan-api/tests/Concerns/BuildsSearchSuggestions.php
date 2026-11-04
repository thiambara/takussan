<?php

namespace Tests\Concerns;

use App\Models\Address;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use App\Services\Search\SearchJournal;
use App\Services\Search\Suggestions\SuggestionIndex;
use App\Services\Search\Suggestions\SuggestionIndexBuilder;
use Illuminate\Http\Request;
use Meilisearch\Client;
use Meilisearch\Contracts\DocumentsQuery;

/**
 * TCK-2474 — fixtures des tests de la suggestion. À utiliser AVEC `InteractsWithMeilisearch` : l'index des biens
 * doit être peuplé (`indexProperties()`) AVANT `buildSuggestions()`, qui en lit les comptes.
 *
 * ⚠ L'index des suggestions n'est pas un index de modèle : `InteractsWithMeilisearch` ne le vide pas entre deux tests
 * d'un même processus. Chaque test qui le lit le reconstruit d'abord (`buildSuggestions()` le remplace en entier).
 */
trait BuildsSearchSuggestions
{
    /** @return array{uid: string, documents: int, kinds: array<string, int>} */
    protected function buildSuggestions(): array
    {
        return app(SuggestionIndexBuilder::class)->build();
    }

    /** @return list<array<string, mixed>> */
    protected function suggestionDocuments(): array
    {
        return app(Client::class)->index(SuggestionIndex::uid())->getDocuments(
            (new DocumentsQuery)->setLimit(1000),
        )->getResults();
    }

    /** @param  array<string, mixed>  $attributes */
    protected function publishedIn(string $city, ?string $neighborhood, array $attributes = []): Property
    {
        $property = Property::factory()->published()->create(['type' => PropertyType::Apartment, ...$attributes]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => $city,
            'neighborhood' => $neighborhood,
        ]);

        return $property;
    }

    /**
     * `$n` visiteurs distincts aujourd'hui pour la même recherche (`SearchJournal::record()`, le chemin de la liste).
     *
     * @param  array<string, mixed>  $criteria
     */
    protected function journalVisitors(int $n, ?string $q, array $criteria = [], int $total = 3, string $serie = 'a'): void
    {
        $journal = app(SearchJournal::class);
        foreach (range(1, $n) as $i) {
            $request = Request::create('/api/public/properties/search', 'GET', server: [
                'REMOTE_ADDR' => sprintf('2001:db8:%s:%x::1', $serie, $i),
                'HTTP_USER_AGENT' => 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0',
            ]);
            $journal->record($request, $q, $criteria, $total);
        }
    }
}
