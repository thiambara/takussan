<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class CalendarTest extends TestCase
{
    use RefreshDatabase;

    public function test_calendar_returns_bookings_and_visits(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        $customer = Customer::factory()->create();
        Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(5)->toDateString(),
        ]);

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => User::factory()->create()->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(2),
        ]);

        Sanctum::actingAs($owner);

        $response = $this->getJson('/api/calendar?start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString());

        $response->assertOk()
            ->assertJsonCount(2, 'data');

        $types = collect($response->json('data'))->pluck('type')->sort()->values();
        $this->assertEquals(['booking', 'visit'], $types->toArray());

        $booking = collect($response->json('data'))->firstWhere('type', 'booking');
        $this->assertArrayHasKey('resource_url', $booking);
        $this->assertStringStartsWith('/app/bookings/', $booking['resource_url']);
        $this->assertTrue($booking['all_day']);

        $visit = collect($response->json('data'))->firstWhere('type', 'visit');
        $this->assertStringStartsWith('/app/visits/', $visit['resource_url']);
        $this->assertFalse($visit['all_day']);
    }

    public function test_calendar_requires_date_range(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/calendar')->assertStatus(422);
    }

    public function test_calendar_scopes_to_owner_only(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();

        $ownerProperty = Property::factory()->create(['user_id' => $owner->id]);
        $otherProperty = Property::factory()->create(['user_id' => $other->id]);

        Booking::factory()->create([
            'property_id' => $ownerProperty->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);

        Booking::factory()->create([
            'property_id' => $otherProperty->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/calendar?start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_calendar_can_be_filtered_by_types(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Booking::factory()->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => User::factory()->create()->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDays(2),
        ]);

        Sanctum::actingAs($owner);

        $from = now()->toDateString();
        $to = now()->addWeek()->toDateString();

        $response = $this->getJson("/api/calendar?start_date={$from}&end_date={$to}&types[]=visit");
        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('visit', $response->json('data.0.type'));

        $response = $this->getJson("/api/calendar?start_date={$from}&end_date={$to}&types[]=booking");
        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('booking', $response->json('data.0.type'));
    }

    public function test_calendar_can_be_filtered_by_property(): void
    {
        $owner = User::factory()->create();
        $propertyA = Property::factory()->create(['user_id' => $owner->id]);
        $propertyB = Property::factory()->create(['user_id' => $owner->id]);

        Booking::factory()->create([
            'property_id' => $propertyA->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);
        Booking::factory()->create([
            'property_id' => $propertyB->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);

        Sanctum::actingAs($owner);

        $response = $this->getJson(sprintf(
            '/api/calendar?start_date=%s&end_date=%s&property_id=%d',
            now()->toDateString(),
            now()->addWeek()->toDateString(),
            $propertyA->id,
        ));

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($propertyA->id, $response->json('data.0.property_id'));
    }

    public function test_calendar_includes_properties_for_accepted_collaborators(): void
    {
        $owner = User::factory()->create();
        $collaborator = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $collaborator->id,
            'role' => CollaboratorRole::Agent,
            'accepted_at' => now(),
        ]);

        Booking::factory()->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);

        Sanctum::actingAs($collaborator);

        $this->getJson('/api/calendar?start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_calendar_excludes_non_accepted_collaborators(): void
    {
        $owner = User::factory()->create();
        $pendingCollaborator = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $pendingCollaborator->id,
            'role' => CollaboratorRole::Agent,
            'invited_at' => now(),
            'accepted_at' => null,
        ]);

        Booking::factory()->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);

        Sanctum::actingAs($pendingCollaborator);

        $this->getJson('/api/calendar?start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString())
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    /**
     * TCK-072 — le calendrier est un agrégateur "agenda des biens", il
     * scope par ownership/collaboration (pas par `bookings.customer_id`).
     * Un customer qui n'est ni owner, ni collaborateur accepté, ni membre
     * de l'agence ne doit donc rien voir — même si des bookings lui
     * appartiennent côté CRM. Le front ajoute en complément un gate rôle
     * sur `/app/calendar` pour ne pas exposer la page vide.
     */
    public function test_calendar_hides_customer_owned_events_from_other_users(): void
    {
        $owner = User::factory()->create();
        $customerUser = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);

        $property = Property::factory()->create(['user_id' => $owner->id]);

        Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);

        Sanctum::actingAs($customerUser);

        $this->getJson('/api/calendar?start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString())
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    /**
     * TCK-072 — garde-fou : `property_id` invalide → 422 (pas de 500 ni
     * de leak silencieux). Protège contre une tentative de sonde sur des
     * IDs inexistants.
     */
    public function test_calendar_rejects_unknown_property_id(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $from = now()->toDateString();
        $to = now()->addWeek()->toDateString();

        $this->getJson("/api/calendar?start_date={$from}&end_date={$to}&property_id=999999")
            ->assertStatus(422);
    }

    /**
     * TCK-072 — garde-fou : `types[]` doit être contraint à l'enum
     * `booking|visit`. Un input inconnu doit remonter une 422 propre
     * plutôt que d'être silencieusement ignoré.
     */
    public function test_calendar_rejects_invalid_type(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $from = now()->toDateString();
        $to = now()->addWeek()->toDateString();

        $this->getJson("/api/calendar?start_date={$from}&end_date={$to}&types[]=booking&types[]=invalid")
            ->assertStatus(422);
    }

    /**
     * TCK-078 — `property_ids[]` narrows the feed to a multi-property
     * subset (dashboard "show only these 3 properties" filter chip).
     */
    public function test_calendar_filters_by_multiple_property_ids(): void
    {
        $owner = User::factory()->create();
        $propertyA = Property::factory()->create(['user_id' => $owner->id]);
        $propertyB = Property::factory()->create(['user_id' => $owner->id]);
        $propertyC = Property::factory()->create(['user_id' => $owner->id]);

        foreach ([$propertyA, $propertyB, $propertyC] as $p) {
            Booking::factory()->create([
                'property_id' => $p->id,
                'status' => BookingStatus::Confirmed,
                'start_date' => now()->addDay()->toDateString(),
                'end_date' => now()->addDays(3)->toDateString(),
            ]);
        }

        Sanctum::actingAs($owner);

        $from = now()->toDateString();
        $to = now()->addWeek()->toDateString();
        $response = $this->getJson(
            "/api/calendar?start_date={$from}&end_date={$to}&property_ids[]={$propertyA->id}&property_ids[]={$propertyC->id}"
        );
        $response->assertOk()->assertJsonCount(2, 'data');
        $ids = collect($response->json('data'))->pluck('property_id')->sort()->values()->all();
        $this->assertEquals([$propertyA->id, $propertyC->id], $ids);
    }

    /**
     * TCK-078 — `agency_id` is admin-only: returns the calendar of a
     * specific agency for cross-agency oversight.
     */
    public function test_calendar_agency_filter_is_admin_only(): void
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        Role::findOrCreate('super_admin');
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $admin->assignRole('super_admin');
        $this->materializeRoleProfile($admin, 'super_admin');

        $targetAgency = Agency::factory()->create();
        $propertyInTarget = Property::factory()->create(['agency_id' => $targetAgency->id]);
        $propertyOutside = Property::factory()->create();

        Booking::factory()->create([
            'property_id' => $propertyInTarget->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);
        Booking::factory()->create([
            'property_id' => $propertyOutside->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);

        Sanctum::actingAs($admin);

        $from = now()->toDateString();
        $to = now()->addWeek()->toDateString();
        $response = $this->getJson("/api/calendar?start_date={$from}&end_date={$to}&agency_id={$targetAgency->id}");
        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($propertyInTarget->id, $response->json('data.0.property_id'));
    }

    public function test_calendar_agency_filter_is_forbidden_for_non_admin(): void
    {
        $regular = User::factory()->create();
        $target = Agency::factory()->create();

        Sanctum::actingAs($regular);

        $from = now()->toDateString();
        $to = now()->addWeek()->toDateString();
        $this->getJson("/api/calendar?start_date={$from}&end_date={$to}&agency_id={$target->id}")
            ->assertForbidden();
    }
}
