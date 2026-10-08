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
use App\Models\Property;
use App\Models\User;
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

    /** @param array<string, mixed> $overrides */
    private function property(array $overrides = [], string $city = 'Dakar', ?Agency $agency = null): Property
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
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => $city,
        ]);

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
