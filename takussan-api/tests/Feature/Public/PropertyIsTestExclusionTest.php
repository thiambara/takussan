<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-163 — verifies that fixtures flagged `is_test=true` never reach
 * the public surface, while the dashboard endpoints (`/api/properties`)
 * stay opt-in and still see them.
 *
 * ⚠️ TCK-314 — `InteractsWithMeilisearch` n'est PAS décoratif ici, et ce qu'il
 * répare mérite d'être nommé : sans lui, `test_public_search_…` passait en
 * suite et échouait seul, pour une raison qui n'a rien à voir avec la
 * recherche.
 *
 * `Tests\TestCase::setUp()` coupe la synchronisation Scout pour toute la
 * suite — mesuré : `ModelObserver::syncingDisabledFor(new Property)` rend
 * `true` dans une classe sans ce concern. Les biens créés ici n'étaient donc
 * JAMAIS indexés. Le test passait quand même dès qu'un test antérieur du même
 * processus avait indexé quelque chose, par un chemin qu'il faut lire deux
 * fois pour y croire :
 *
 *   · l'index gardait les documents PÉRIMÉS du test précédent (ids 1, 2…) ;
 *   · `RefreshDatabase` rembobine la base, donc les ids repartent à 1 ;
 *   · `PropertySearchService::hydrate()` recharge les hits DEPUIS LA BASE, par
 *     id — et rend donc les lignes du test COURANT pour les ids d'un autre.
 *
 * Mesuré : `DBids=1,2  INDEXids=1|2`, et le titre attendu ressortait. Ce test
 * croyait interroger Meilisearch ; il faisait de l'arithmétique
 * d'identifiants. Un `is_test` filtré côté moteur portait, lui, la valeur de
 * l'ancien document — juste par coïncidence.
 *
 * D'où la règle, qui vaut au-delà de ce fichier : **un test qui interroge une
 * surface de recherche indexe ce qu'il interroge.** Les neuf autres tests du
 * dépôt touchant une surface de recherche ont été relancés SEULS à cette
 * occasion — ils passent tous, ce trou n'existait qu'ici.
 */
class PropertyIsTestExclusionTest extends TestCase
{
    use InteractsWithMeilisearch, RefreshDatabase;

    public function test_public_index_excludes_is_test_properties(): void
    {
        Property::factory()->published()->create(['title' => 'Real Listing', 'is_test' => false]);
        Property::factory()->published()->create(['title' => 'Property Test Filter - abcd', 'is_test' => true]);

        $titles = collect($this->getJson('/api/public/properties')->json('data'))
            ->pluck('title')
            ->all();

        $this->assertContains('Real Listing', $titles);
        $this->assertNotContains('Property Test Filter - abcd', $titles);
    }

    public function test_public_search_excludes_is_test_properties(): void
    {
        Property::factory()->published()->create(['title' => 'Searchable Real', 'is_test' => false]);
        Property::factory()->published()->create(['title' => 'Searchable Test Fixture', 'is_test' => true]);

        // Ce test interroge Meilisearch : il indexe donc ce qu'il interroge,
        // au lieu de dépendre de ce qu'un test antérieur y aurait laissé
        // (cf. le docblock de classe — TCK-314).
        $this->indexProperties();

        $titles = collect($this->getJson('/api/public/properties/search')->json('data'))
            ->pluck('title')
            ->all();

        $this->assertContains('Searchable Real', $titles);
        $this->assertNotContains('Searchable Test Fixture', $titles);
    }

    public function test_public_show_returns_404_for_is_test_properties(): void
    {
        $property = Property::factory()->published()->create(['is_test' => true]);

        $this->getJson("/api/public/properties/{$property->slug}")->assertNotFound();
    }

    public function test_flag_test_command_marks_fixtures(): void
    {
        $real = Property::factory()->published()->create(['title' => 'Real Apartment', 'is_test' => false]);
        $fixture = Property::factory()->published()->create(['title' => 'Property Test Filter - xyz', 'is_test' => false]);

        $this->artisan('properties:flag-test')->assertSuccessful();

        $this->assertFalse($real->refresh()->is_test);
        $this->assertTrue($fixture->refresh()->is_test);
    }
}
