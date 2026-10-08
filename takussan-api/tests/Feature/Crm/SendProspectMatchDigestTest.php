<?php

namespace Tests\Feature\Crm;

use App\Jobs\Crm\SendProspectMatchDigest;
use App\Models\Address;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use App\Models\Property;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-591 AC11 (récapitulatif) — le référent est notifié une fois ; personne quand rien ne
 * correspond ; un rejeu du même jour ne renotifie pas.
 */
class SendProspectMatchDigestTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $referent;

    private User $creator;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->referent = User::factory()->create(['preferred_language' => 'en']);
        $this->materializeRoleProfile($this->referent, 'agent', $this->agency);
        $this->creator = User::factory()->create();
        $this->materializeRoleProfile($this->creator, 'agent', $this->agency);

        $prospect = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->creator->id,
            'pipeline_stage' => CustomerPipelineStage::Prospect,
            'seeking_contract_type' => 'rent',
            'budget_max' => 300000,
            'seeking_cities' => ['Dakar'],
            'min_bedrooms' => 2,
        ]);
        UserCustomerRelationship::query()->create([
            'user_id' => $this->referent->id,
            'customer_id' => $prospect->id,
            'relationship_type' => RelationshipType::cases()[0],
            'status' => RelationshipStatus::Active,
            'is_primary' => true,
        ]);
    }

    /** @param array<string, mixed> $overrides */
    private function property(array $overrides = []): Property
    {
        $property = Property::factory()->create(array_merge([
            'agency_id' => $this->agency->id,
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
            'city' => 'Dakar',
        ]);

        return $property;
    }

    private function age(Property $property, int $days): void
    {
        DB::table('properties')->where('id', $property->id)->update([
            'created_at' => now()->subDays($days),
            'published_at' => now()->subDays($days),
        ]);
    }

    public function test_the_referent_is_notified_once_in_his_language(): void
    {
        $this->property();
        $this->property(['price' => 280000]);

        dispatch_sync(new SendProspectMatchDigest);
        dispatch_sync(new SendProspectMatchDigest);

        $notification = AppNotification::query()->sole();
        $this->assertSame($this->referent->id, $notification->user_id);
        $this->assertSame('Properties match your prospects', $notification->title);
        $this->assertStringContainsString('2 new or repriced', $notification->body);
        $this->assertSame(1, $notification->data['prospects_count']);
    }

    public function test_nobody_is_notified_when_nothing_matches(): void
    {
        $this->property(['price' => 350000]);
        $this->age($this->property(), 3);

        dispatch_sync(new SendProspectMatchDigest);

        $this->assertSame(0, AppNotification::query()->count());
    }

    public function test_a_price_change_brings_an_old_property_back(): void
    {
        $property = $this->property(['price' => 350000]);
        $this->age($property, 30);

        $property->update(['price' => 290000]);

        dispatch_sync(new SendProspectMatchDigest);

        $this->assertSame($this->referent->id, AppNotification::query()->sole()->user_id);
    }

    public function test_without_a_staff_referent_the_creator_is_notified(): void
    {
        UserCustomerRelationship::query()->update(['status' => RelationshipStatus::Ended]);
        $this->property();

        dispatch_sync(new SendProspectMatchDigest);

        $this->assertSame($this->creator->id, AppNotification::query()->sole()->user_id);
    }
}
