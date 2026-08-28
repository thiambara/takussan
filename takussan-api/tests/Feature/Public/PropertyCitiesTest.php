<?php

namespace Tests\Feature\Public;

use App\Http\Controllers\Public\PublicPropertyController;
use App\Models\Address;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-433 (passe 2) — `GET /api/public/properties/cities` : le DOMAINE de la facette `city`.
 *
 * Ce que ces tests gardent : le domaine ne contient QUE des villes atteignables par une fiche
 * publique. Une ville qui y entrerait sans annonce publique rendrait canonique d'elle-même une
 * page de facette vide — et c'est le défaut que cet endpoint existe pour fermer, un cran plus bas
 * que `?city=Zzzinventee`.
 */
class PropertyCitiesTest extends TestCase
{
    use RefreshDatabase;

    /**
     * ⚠ L'adresse est CRÉÉE, pas mise à jour. `PropertyFactory` n'en crée aucune — mesuré, elle
     * ne mentionne pas `Address` —, si bien qu'un `update()` sur une ligne absente ne touche rien
     * et laisse le domaine vide. C'est le patron des cinq autres tests publics qui posent une
     * ville (`HomepageDiscoveryTest`, `PropertyDetailTest`…).
     */
    private function bienA(string $ville, array $attributs = []): Property
    {
        $property = Property::factory()->published()->create($attributs);

        Address::factory()->create([
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'city' => $ville,
        ]);

        return $property;
    }

    public function test_lists_cities_of_public_properties_with_counts(): void
    {
        $this->bienA('Dakar');
        $this->bienA('Dakar');
        $this->bienA('Thiès');

        $response = $this->getJson('/api/public/properties/cities');

        $response->assertOk()
            ->assertJsonStructure(['data' => [['value', 'count']], 'meta' => ['truncated']])
            ->assertJsonPath('meta.truncated', false);

        $this->assertSame(
            [['value' => 'Dakar', 'count' => 2], ['value' => 'Thiès', 'count' => 1]],
            $response->json('data'),
        );
    }

    public function test_excludes_cities_that_only_have_non_public_properties(): void
    {
        // Le point de l'endpoint : une ville dont aucune annonce n'est publique ne doit pas
        // rendre une page de facette canonique d'elle-même.
        $this->bienA('Dakar');
        $this->bienA('VilleFantome', ['status' => PropertyStatus::Draft]);

        $villes = collect($this->getJson('/api/public/properties/cities')->json('data'))
            ->pluck('value')
            ->all();

        $this->assertSame(['Dakar'], $villes);
    }

    public function test_excludes_empty_city(): void
    {
        $this->bienA('');
        $this->bienA('Dakar');

        $villes = collect($this->getJson('/api/public/properties/cities')->json('data'))
            ->pluck('value')
            ->all();

        $this->assertSame(['Dakar'], $villes);
    }

    public function test_returns_an_empty_domain_rather_than_an_error_when_the_catalogue_is_empty(): void
    {
        // Un domaine vide est une réponse, pas une panne : le front repliera toutes les facettes
        // de ville sur la page nue, ce qui est le comportement sûr.
        $this->getJson('/api/public/properties/cities')
            ->assertOk()
            ->assertJsonPath('data', [])
            ->assertJsonPath('meta.truncated', false);
    }

    public function test_no_auth_required(): void
    {
        $this->getJson('/api/public/properties/cities')->assertOk();
    }

    public function test_route_is_not_swallowed_by_the_slug_route(): void
    {
        // `properties/cities` doit rester AU-DESSUS de `properties/{slug}`. L'inversion ne produit
        // pas une erreur : elle produit un 404 « bien introuvable » sur un slug nommé « cities ».
        $this->bienA('Dakar');

        $response = $this->getJson('/api/public/properties/cities');

        $response->assertOk();
        $this->assertIsArray($response->json('data'));
        $this->assertArrayHasKey('truncated', $response->json('meta'));
    }

    public function test_cap_is_declared_and_plausible(): void
    {
        // Le plafond garde contre une base polluée. Il ne se mesure pas en créant 501 biens —
        // ce serait payer 501 insertions pour éprouver une comparaison —, mais il doit exister
        // et rester au-dessus de tout catalogue plausible.
        $this->assertGreaterThan(100, PublicPropertyController::CITIES_MAX);
    }
}
