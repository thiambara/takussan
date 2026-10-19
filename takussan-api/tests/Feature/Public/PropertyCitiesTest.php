<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Customer;
use App\Models\Enums\ContractType;
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
            collect($response->json('data'))->map(fn ($v) => ['value' => $v['value'], 'count' => $v['count']])->all(),
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

    /**
     * ⚠️ **LE BORD DU PLAFOND, éprouvé avec TROIS biens.**
     *
     * La passe 1 avait argué qu'éprouver le plafond coûterait 501 insertions et s'était contentée
     * de vérifier que la constante existait — c'est-à-dire de ne rien mesurer. Le coût réel
     * n'était pas 501 insertions, c'était **une ligne de configuration** : `catalogue.cities_max`
     * s'abaisse à 2, et les trois cas du bord tiennent en trois biens.
     *
     * *Un seuil qu'on ne peut pas atteindre en test est un seuil qu'on ne teste pas.*
     */
    public function test_exactly_at_the_cap_is_not_truncated(): void
    {
        config(['catalogue.cities_max' => 2]);
        $this->bienA('Dakar');
        $this->bienA('Thiès');

        $this->getJson('/api/public/properties/cities')
            ->assertOk()
            ->assertJsonPath('meta.truncated', false)
            ->assertJsonCount(2, 'data');
    }

    public function test_one_over_the_cap_is_truncated_and_capped(): void
    {
        config(['catalogue.cities_max' => 2]);
        $this->bienA('Dakar');
        $this->bienA('Thiès');
        $this->bienA('Touba');

        $reponse = $this->getJson('/api/public/properties/cities');

        // Les DEUX assertions comptent. `truncated` sans plafonnement rendrait un domaine complet
        // que le front refuserait pour rien ; le plafonnement sans `truncated` rendrait un domaine
        // AMPUTÉ que le front emploierait comme s'il était complet — et déclarerait alors non
        // canonique chaque ville qui n'a pas tenu. C'est ce second cas qui coûte.
        $reponse->assertOk()
            ->assertJsonPath('meta.truncated', true)
            ->assertJsonCount(2, 'data');
    }

    public function test_the_cap_comes_from_configuration_not_from_a_frozen_constant(): void
    {
        // Le contrôle qui garde le test : sans lui, un contrôleur qui ignorerait la configuration
        // passerait les deux cas ci-dessus dès que le plafond réel serait supérieur à 3.
        config(['catalogue.cities_max' => 1]);
        $this->bienA('Dakar');
        $this->bienA('Thiès');

        $this->getJson('/api/public/properties/cities')
            ->assertOk()
            ->assertJsonPath('meta.truncated', true)
            ->assertJsonCount(1, 'data');
    }

    /**
     * ⚠️ **L'ISOLEMENT DE LA JOINTURE POLYMORPHE — une surface publique ANONYME.**
     *
     * Quatre modèles sont adressables : `User`, `Agency`, `Property`, `Customer`. La jointure de
     * `cities()` porte `->where('addresses.addressable_type', '=', Property::class)` ; **la
     * retirer laissait les sept tests de ce fichier VERTS**, alors que l'adresse d'un CLIENT dont
     * l'id coïncide avec celui d'un bien public entrerait dans « le domaine des villes du
     * catalogue public ».
     *
     * Le test force la coïncidence d'id plutôt que d'espérer qu'elle se produise : les séquences
     * de `customers` et de `properties` sont indépendantes, et `nextval()` n'est pas
     * transactionnel (piège PostgreSQL n°6), donc « les ids se croisent parfois » n'est pas une
     * garantie — c'est un test qui passerait au hasard.
     */
    public function test_an_address_of_another_addressable_type_never_enters_the_domain(): void
    {
        $bien = $this->bienA('Dakar');

        $client = Customer::factory()->create();
        Address::factory()->create([
            'addressable_id' => $bien->id,
            'addressable_type' => Customer::class,
            'city' => 'VilleDeClient',
        ]);
        // Et une seconde, sur l'id réel du client, pour couvrir les deux façons de se tromper.
        Address::factory()->create([
            'addressable_id' => $client->id,
            'addressable_type' => Customer::class,
            'city' => 'AutreVilleDeClient',
        ]);

        $villes = collect($this->getJson('/api/public/properties/cities')->json('data'))
            ->pluck('value')
            ->all();

        $this->assertSame(['Dakar'], $villes);
    }

    /**
     * P35.04 — **une ville, une entrée, comptée une fois**, quelle que soit la casse saisie.
     *
     * Le front replie chaque valeur en minuscules (`villesDuCatalogue`, `facettes.ts`) : si l'API
     * rendait « Zzvillé » (3) et « ZZVILLÉ » (1) séparément, la page de ville prendrait la graphie
     * de la dernière entrée lue, la MOINS fréquente, et le sitemap annoncerait la même canonique
     * deux fois. La ville est hors référentiel, seul cas où `GeoAddressCanonicalizer` la laisse
     * brute ; l'accent vérifie que le repli n'est pas celui de `lower()` nu sous `--locale=C`.
     */
    public function test_case_variants_of_a_city_are_one_entry_with_the_most_frequent_spelling(): void
    {
        $this->bienA('Zzvillé');
        $this->bienA('Zzvillé');
        $this->bienA('Zzvillé');
        $this->bienA('ZZVILLÉ');
        $this->bienA('Thiès');

        $this->assertSame(
            [['value' => 'Zzvillé', 'count' => 4], ['value' => 'Thiès', 'count' => 1]],
            collect($this->getJson('/api/public/properties/cities')->assertOk()->json('data'))
                ->map(fn ($v) => ['value' => $v['value'], 'count' => $v['count']])->all(),
        );
    }

    /**
     * P35.05 — le compte de chaque ville PAR CONTRAT, pour que le sitemap n'annonce une paire
     * contrat × ville (« à louer à Dakar ») qu'à partir de 3 biens. Toujours les deux contrats,
     * zéro compris : le front n'a pas à deviner une clé absente.
     */
    public function test_each_city_carries_its_count_per_contract(): void
    {
        $this->bienA('Dakar', ['contract_type' => ContractType::Rent]);
        $this->bienA('Dakar', ['contract_type' => ContractType::Rent]);
        $this->bienA('Dakar', ['contract_type' => ContractType::Sale]);
        $this->bienA('Thiès', ['contract_type' => ContractType::Sale]);

        $this->assertSame(
            [
                ['value' => 'Dakar', 'count' => 3, 'contracts' => ['sale' => 1, 'rent' => 2]],
                ['value' => 'Thiès', 'count' => 1, 'contracts' => ['sale' => 1, 'rent' => 0]],
            ],
            $this->getJson('/api/public/properties/cities')->assertOk()->json('data'),
        );
    }
}
