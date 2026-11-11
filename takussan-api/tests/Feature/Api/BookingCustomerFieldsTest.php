<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2593 — le client servi avec la réservation : au personnel de l'agence, son téléphone, son
 * étape et `visits_on_property` (ses visites terminées du même bien) ; au client, ni l'un ni
 * l'autre de ces champs propres au personnel.
 */
class BookingCustomerFieldsTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $client;

    private Property $property;

    private Booking $booking;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->client = User::factory()->create();
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $customer = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->client->id,
            'first_name' => 'Ousmane', 'last_name' => 'Ba', 'phone' => '+221771234567',
            'pipeline_stage' => CustomerPipelineStage::cases()[1],
        ]);
        $this->booking = Booking::factory()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id,
            'customer_id' => $customer->id, 'created_by_id' => $this->agent->id,
            'kind' => BookingKind::Application,
        ]);

        // Deux visites terminées de ce client sur ce bien — l'une par sa fiche, l'autre par son
        // compte seul (demande publique) ; puis ce qui ne compte pas : annulée, à venir, autre bien,
        // autre client.
        $this->visit(['customer_id' => $customer->id, 'visitor_id' => null], VisitStatus::Completed);
        $this->visit(['customer_id' => null, 'visitor_id' => $this->client->id], VisitStatus::Completed);
        $this->visit(['customer_id' => $customer->id, 'visitor_id' => null], VisitStatus::Cancelled);
        $this->visit(['customer_id' => $customer->id, 'visitor_id' => null], VisitStatus::Scheduled);
        $this->visit(['customer_id' => $customer->id, 'visitor_id' => null, 'property_id' => Property::factory()->create(['agency_id' => $this->agency->id])->id], VisitStatus::Completed);
        $this->visit(['customer_id' => Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => null])->id, 'visitor_id' => null], VisitStatus::Completed);
    }

    /** @param  array<string, mixed>  $attributes */
    private function visit(array $attributes, VisitStatus $status): void
    {
        PropertyVisit::factory()->create($attributes + [
            'property_id' => $this->property->id,
            'status' => $status,
            'scheduled_at' => $status === VisitStatus::Scheduled ? now()->addDays(2) : now()->subDays(3),
        ]);
    }

    public function test_ac3_the_staff_reads_the_phone_the_stage_and_the_visits_on_the_property(): void
    {
        Sanctum::actingAs($this->agent);

        foreach ([
            $this->getJson('/api/bookings?include=customer')->assertOk()->json('data.0'),
            $this->getJson("/api/bookings/{$this->booking->id}")->assertOk()->json('data'),
        ] as $row) {
            $this->assertSame('+221771234567', $row['customer']['phone']);
            $this->assertSame($this->client->id, $row['customer']['user_id']);
            $this->assertSame(CustomerPipelineStage::cases()[1]->value, $row['customer']['pipeline_stage']);
            $this->assertSame(2, $row['visits_on_property']);
        }
    }

    public function test_ac3_the_customer_reads_neither_the_phone_nor_the_visits(): void
    {
        Sanctum::actingAs($this->client);

        foreach ([
            $this->getJson('/api/bookings?include=customer')->assertOk()->json('data.0'),
            $this->getJson("/api/bookings/{$this->booking->id}")->assertOk()->json('data'),
        ] as $row) {
            $this->assertSame($this->booking->id, $row['id']);
            $this->assertSame('Ousmane', $row['customer']['first_name']);
            $this->assertArrayNotHasKey('phone', $row['customer']);
            $this->assertArrayNotHasKey('pipeline_stage', $row['customer']);
            $this->assertArrayNotHasKey('visits_on_property', $row);
        }
    }

    public function test_the_customer_fields_are_allowed_in_a_sparse_fieldset(): void
    {
        Sanctum::actingAs($this->agent);

        $row = $this->getJson('/api/bookings?include=customer&fields[bookings]=id,agency_id,customer_id,property_id&fields[customers]=id,first_name,last_name,phone,user_id,pipeline_stage')
            ->assertOk()->json('data.0');

        $this->assertSame('+221771234567', $row['customer']['phone']);
        $this->assertSame($this->client->id, $row['customer']['user_id']);
        $this->assertSame(2, $row['visits_on_property']);
    }

    public function test_the_visits_cost_one_query_for_the_page(): void
    {
        Sanctum::actingAs($this->agent);
        $this->getJson('/api/bookings?include=customer')->assertOk(); // échauffement

        $count = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/bookings?include=customer')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $few = $count();
        foreach (range(1, 6) as $i) {
            $customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => User::factory()->create()->id]);
            $property = Property::factory()->create(['agency_id' => $this->agency->id]);
            Booking::factory()->create([
                'property_id' => $property->id, 'agency_id' => $this->agency->id,
                'customer_id' => $customer->id, 'created_by_id' => $this->agent->id,
            ]);
            PropertyVisit::factory()->create(['property_id' => $property->id, 'customer_id' => $customer->id, 'visitor_id' => null, 'status' => VisitStatus::Completed, 'scheduled_at' => now()->subDay()]);
        }

        $this->assertSame($few, $count());
    }

    /**
     * Le bailleur du bien lit la réservation (TCK-1930), pas la fiche CRM : comme pour la visite
     * (TCK-590), ni téléphone ni étape ni visites — ce sont des champs du personnel.
     */
    public function test_the_landlord_reads_the_booking_without_the_staff_fields(): void
    {
        $landlord = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);
        $this->property->update(['user_id' => $landlord->id]);

        Sanctum::actingAs($landlord->fresh());
        $row = $this->getJson('/api/bookings?include=customer')->assertOk()->json('data.0');

        $this->assertSame($this->booking->id, $row['id']);
        $this->assertArrayNotHasKey('phone', $row['customer']);
        $this->assertArrayNotHasKey('pipeline_stage', $row['customer']);
        $this->assertArrayNotHasKey('visits_on_property', $row);
    }

    public function test_another_agency_staff_never_reads_the_booking(): void
    {
        Sanctum::actingAs(User::factory()->withAgentProfile(Agency::factory()->create())->create());

        $this->assertSame([], $this->getJson('/api/bookings?include=customer')->assertOk()->json('data'));
        $this->getJson("/api/bookings/{$this->booking->id}")->assertForbidden();
    }
}
