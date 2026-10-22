<?php

namespace Tests\Feature\Crm;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\User;
use App\Services\Crm\ProspectMatcher;
use App\Services\Geo\GeoNeighborhoodModeration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-591 AC11 (rapprochement) — en SQL, privé compris, borné à l'agence, dans les deux sens.
 */
class ProspectMatcherTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private Customer $prospect;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);

        $this->prospect = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->agent->id,
            'pipeline_stage' => CustomerPipelineStage::Prospect,
            'seeking_contract_type' => 'rent',
            'budget_max' => 300000,
            'seeking_cities' => ['Dakar'],
            'min_bedrooms' => 2,
        ]);
    }

    /**
     * TCK-1083 (P67.04) — la fusion réécrit le texte des adresses vers la cible (« Liberté 4 ») ;
     * le prospect a gardé l'ancien nom. Le rapprochement comparait les textes : 0 dans les deux
     * sens, et le récapitulatif quotidien se taisait. Il suit désormais la fusion, comme la
     * recherche publique (`QuartierDuFiltre`).
     */
    public function test_a_merged_neighborhood_still_matches_both_ways(): void
    {
        $ville = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        $source = GeoNeighborhood::factory()->create(['geo_city_id' => $ville->id, 'name' => 'Liberte Quatre', 'slug' => 'liberte-quatre']);
        $cible = GeoNeighborhood::factory()->create(['geo_city_id' => $ville->id, 'name' => 'Liberté 4', 'slug' => 'liberte-4']);
        $this->prospect->update(['seeking_neighborhoods' => ['Liberte Quatre']]);
        $bien = $this->property(neighborhood: 'Liberte Quatre', neighborhoodId: $source->id);
        $this->property(neighborhood: 'Médina');
        $this->assertMatchesBothWays($bien);

        app(GeoNeighborhoodModeration::class)->fusionner($source, $cible, User::factory()->create());
        $this->assertSame('Liberté 4', $bien->address()->first()->neighborhood);

        $this->assertMatchesBothWays($bien);
        $this->actingAsApi($this->agent)
            ->apiGet("/api/properties/{$bien->id}/matching-customers")
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $this->prospect->id);
    }

    /**
     * TCK-1083 (P67.05) — la saisie du prospect est libre : « Liberte 4 » doit trouver le bien de
     * « Liberté 4 », rattaché ou non, comme la recherche publique (`CleDeQuartier`, TCK-663).
     */
    public function test_a_neighborhood_written_without_accent_or_hyphen_matches(): void
    {
        $ville = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        $quartier = GeoNeighborhood::factory()->create(['geo_city_id' => $ville->id, 'name' => 'Liberté 4', 'slug' => 'liberte-4']);
        $this->prospect->update(['seeking_neighborhoods' => ['Liberte 4', 'grand yoff']]);
        $rattache = $this->property(neighborhood: 'Liberté 4', neighborhoodId: $quartier->id);
        $libre = $this->property(neighborhood: 'Grand-Yoff');
        $this->property(neighborhood: 'Grand Dakar');

        $this->assertEqualsCanonicalizing(
            [$rattache->id, $libre->id],
            app(ProspectMatcher::class)->propertiesFor($this->prospect->fresh())->pluck('properties.id')->all(),
        );
        $this->assertMatchesBothWays($rattache);
        $this->assertMatchesBothWays($libre);
    }

    private function assertMatchesBothWays(Property $bien): void
    {
        $matcher = app(ProspectMatcher::class);
        $this->assertContains($bien->id, $matcher->propertiesFor($this->prospect->fresh())->pluck('properties.id')->all());
        $this->assertSame([$this->prospect->id], $matcher->customersFor($bien->fresh())->pluck('customers.id')->all());
    }

    /** @param array<string, mixed> $overrides */
    private function property(array $overrides = [], string $city = 'Dakar', ?Agency $agency = null, ?string $neighborhood = null, ?int $neighborhoodId = null): Property
    {
        $property = Property::factory()->create(array_merge([
            'agency_id' => ($agency ?? $this->agency)->id,
            'contract_type' => ContractType::Rent,
            'type' => PropertyType::Apartment,
            'price' => 250000,
            'bedrooms' => 3,
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Private,
        ], $overrides));
        Address::factory()->create(array_filter([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => $city,
            'neighborhood' => $neighborhood,
            'geo_neighborhood_id' => $neighborhoodId,
        ], static fn ($valeur) => $valeur !== null));

        return $property;
    }

    public function test_the_prospect_matches_a_private_agency_property_and_nothing_else(): void
    {
        $match = $this->property();
        $this->property(['price' => 350000]);
        $this->property([], agency: Agency::factory()->create());
        $this->property(['bedrooms' => 1]);
        $this->property(['contract_type' => ContractType::Sale]);
        $this->property([], city: 'Thiès');
        $this->property(['status' => PropertyStatus::Rented]);

        $this->actingAsApi($this->agent)
            ->apiGet("/api/customers/{$this->prospect->id}/matching-properties")
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $match->id)
            ->assertJsonPath('data.0.visibility', 'private');
    }

    public function test_city_is_compared_folded(): void
    {
        $this->prospect->update(['seeking_cities' => ['DAKAR']]);
        $match = $this->property();

        $this->actingAsApi($this->agent)
            ->apiGet("/api/customers/{$this->prospect->id}/matching-properties")
            ->assertOk()
            ->assertJsonPath('data.0.id', $match->id);
    }

    /**
     * TCK-1167 (P99.05) — les villes du prospect sont saisies en texte libre : « Guediawaye »
     * trouve « Guédiawaye », comme « Liberte 4 » trouve « Liberté 4 » pour les quartiers
     * (TCK-1083). La casse seule ne suffisait pas : 0 dans les deux sens.
     */
    public function test_a_city_written_without_accent_matches_both_ways(): void
    {
        $this->prospect->update(['seeking_cities' => ['Guediawaye', 'thies']]);
        $guediawaye = $this->property([], city: 'Guédiawaye');
        $thies = $this->property([], city: 'Thiès');
        $this->property([], city: 'Dakar');

        $this->assertEqualsCanonicalizing(
            [$guediawaye->id, $thies->id],
            app(ProspectMatcher::class)->propertiesFor($this->prospect->fresh())->pluck('properties.id')->all(),
        );
        $this->assertMatchesBothWays($guediawaye);
        $this->assertMatchesBothWays($thies);
    }

    public function test_the_property_lists_its_matching_prospects(): void
    {
        $property = $this->property();

        // Converti, perdu, sans critère, ou d'une autre agence : jamais.
        Customer::factory()->create(array_merge($this->prospect->only(['seeking_contract_type', 'budget_max', 'seeking_cities', 'min_bedrooms']), [
            'agency_id' => $this->agency->id, 'pipeline_stage' => CustomerPipelineStage::Converted,
        ]));
        Customer::factory()->create(array_merge($this->prospect->only(['seeking_contract_type', 'budget_max', 'seeking_cities', 'min_bedrooms']), [
            'agency_id' => $this->agency->id, 'pipeline_stage' => CustomerPipelineStage::Lost,
        ]));
        Customer::factory()->create(['agency_id' => $this->agency->id]);
        Customer::factory()->create(array_merge($this->prospect->only(['seeking_contract_type', 'budget_max', 'seeking_cities', 'min_bedrooms']), [
            'agency_id' => Agency::factory()->create()->id,
        ]));
        // Un budget trop court.
        Customer::factory()->create(['agency_id' => $this->agency->id, 'budget_max' => 200000]);

        $this->actingAsApi($this->agent)
            ->apiGet("/api/properties/{$property->id}/matching-customers")
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $this->prospect->id);
    }

    public function test_only_the_agency_staff_can_match(): void
    {
        $property = $this->property();
        $landlord = User::factory()->create();
        $this->materializeRoleProfile($landlord, 'owner', $this->agency);
        $property->update(['user_id' => $landlord->id]);
        $outsider = User::factory()->create();
        $this->materializeRoleProfile($outsider, 'agent', Agency::factory()->create());

        $this->actingAsApi($landlord)->apiGet("/api/properties/{$property->id}/matching-customers")->assertForbidden();
        $this->actingAsApi($outsider)->apiGet("/api/properties/{$property->id}/matching-customers")->assertForbidden();
        $this->actingAsApi($outsider)->apiGet("/api/customers/{$this->prospect->id}/matching-properties")->assertForbidden();
    }
}
