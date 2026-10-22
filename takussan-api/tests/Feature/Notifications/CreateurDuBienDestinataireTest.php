<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\BookingStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Notifications\BookingExpiredNotification;
use App\Notifications\CodedNotification;
use App\Services\Booking\BookingExpirationService;
use App\Services\Booking\BookingStakeholders;
use App\Services\Maintenance\MaintenanceParticipants;
use App\Services\Property\PrimaryPropertyContact;
use App\Services\Review\ReviewNotifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-1316 (P126.04) — `properties.user_id` est le créateur du bien : sur un bien d'agence, souvent
 * l'agent qui l'a saisi. Il n'est prévenu que s'il est propriétaire au sens d'`estProprietaire`, ou
 * personnel actif de l'agence du bien ; suspendu ou parti, il est écarté de chaque site.
 */
class CreateurDuBienDestinataireTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = Agency::factory()->create();
    }

    public function test_the_creator_counts_when_landlord_or_active_staff_and_not_otherwise(): void
    {
        $suspended = $this->agent(AgentProfileStatus::Suspended);
        $active = $this->agent(AgentProfileStatus::Active);
        $landlord = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);
        $gone = User::factory()->create();
        $private = User::factory()->create();

        $this->assertNull(PrimaryPropertyContact::createurDestinataire($this->propertyOf($suspended)));
        $this->assertNull(PrimaryPropertyContact::createurDestinataire($this->propertyOf($gone)));
        $this->assertSame($active->id, PrimaryPropertyContact::createurDestinataire($this->propertyOf($active))?->id);
        $this->assertSame($landlord->id, PrimaryPropertyContact::createurDestinataire($this->propertyOf($landlord))?->id);
        $this->assertSame($private->id, PrimaryPropertyContact::createurDestinataire(
            Property::factory()->create(['user_id' => $private->id, 'agency_id' => null])
        )?->id);
    }

    public function test_maintenance_principals_skip_a_suspended_creator(): void
    {
        $suspended = $this->agent(AgentProfileStatus::Suspended);
        $mr = MaintenanceRequest::factory()->create(['property_id' => $this->propertyOf($suspended)->id]);

        $ids = app(MaintenanceParticipants::class)->principals($mr->fresh())->pluck('id');

        $this->assertNotContains($suspended->id, $ids);
    }

    public function test_booking_stakeholders_skip_a_suspended_creator(): void
    {
        $suspended = $this->agent(AgentProfileStatus::Suspended);
        $property = $this->propertyOf($suspended);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $this->agency->id]);

        $stakeholders = app(BookingStakeholders::class);

        $this->assertNotContains($suspended->id, $stakeholders->propertyTeam($property->fresh())->pluck('id'));
        $this->assertNotContains($suspended->id, $stakeholders->for($booking->fresh())->pluck('id'));
    }

    public function test_review_received_skips_a_suspended_creator_and_reaches_an_active_one(): void
    {
        $suspended = $this->agent(AgentProfileStatus::Suspended);
        $active = $this->agent(AgentProfileStatus::Active);

        $notifier = app(ReviewNotifier::class);
        $notifier->received($this->reviewOf($this->propertyOf($suspended)));
        $notifier->received($this->reviewOf($this->propertyOf($active)));

        Notification::assertNotSentTo($suspended, CodedNotification::class, fn (CodedNotification $n) => $n->code === NotificationCode::ReviewReceived);
        Notification::assertSentTo($active, CodedNotification::class, fn (CodedNotification $n) => $n->code === NotificationCode::ReviewReceived);
    }

    public function test_an_expired_booking_falls_back_past_a_suspended_creator(): void
    {
        $suspended = $this->agent(AgentProfileStatus::Suspended);
        $creator = $this->agent(AgentProfileStatus::Active);
        $booking = Booking::factory()->create([
            'property_id' => $this->propertyOf($suspended)->id,
            'agency_id' => $this->agency->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'created_by_id' => $creator->id,
            'status' => BookingStatus::Pending,
        ]);

        $this->assertTrue(app(BookingExpirationService::class)->expire($booking, 'manual'));

        Notification::assertNotSentTo($suspended, BookingExpiredNotification::class);
        Notification::assertSentTo($creator, BookingExpiredNotification::class);
    }

    public function test_a_new_maintenance_request_does_not_warn_a_suspended_creator(): void
    {
        $suspended = $this->agent(AgentProfileStatus::Suspended);
        $property = $this->propertyOf($suspended);
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $this->agency->id]);

        $this->actingAs($admin)->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Fuite',
            'description' => 'Sous l’évier',
            'category' => 'plumbing',
        ])->assertCreated();

        Notification::assertNotSentTo($suspended, CodedNotification::class, fn (CodedNotification $n) => $n->code === NotificationCode::MaintenanceCreated);
    }

    private function agent(AgentProfileStatus $status): User
    {
        $user = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agency->id, 'status' => $status]);

        return $user;
    }

    private function propertyOf(User $creator): Property
    {
        return Property::factory()->create(['user_id' => $creator->id, 'agency_id' => $this->agency->id]);
    }

    private function reviewOf(Property $property): Review
    {
        return Review::factory()->create([
            'reviewable_type' => $property->getMorphClass(),
            'reviewable_id' => $property->id,
        ]);
    }
}
