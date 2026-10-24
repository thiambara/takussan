<?php

namespace Tests\Feature\Booking;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-1494 (P116.04) — expirer une réservation à la main se juge par `bookings.cancel`
 * (`BookingPolicy::expire`), comme l'annuler, et non par le type de profil admin.
 *
 * Avant : `POST /api/bookings/{b}/expire-now` exigeait super-admin ou `isAgencyAdminAt` ; un admin
 * dont le rôle retire `bookings.cancel` expirait la réservation, un agent qui la porte recevait 403.
 */
class ExpireNowCapabilityTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private Booking $booking;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);
        $this->booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'created_by_id' => $landlord->id,
            'agency_id' => $this->agency->id,
            'status' => BookingStatus::Pending,
        ]);
    }

    private function expire(User $actor): TestResponse
    {
        return $this->actingAsApi($actor)->postJson("/api/bookings/{$this->booking->id}/expire-now");
    }

    public function test_un_admin_sans_bookings_cancel_est_refuse(): void
    {
        $this->expire($this->adminWithout($this->agency, Capability::BookingsCancel))
            ->assertForbidden()
            ->assertJsonPath('code', 'auth.insufficient_privileges');

        $this->assertSame(BookingStatus::Pending, $this->booking->refresh()->status);
    }

    public function test_un_agent_qui_porte_bookings_cancel_expire_la_reservation(): void
    {
        $this->expire($this->agencyAgent($this->agency))->assertOk();

        $this->assertSame(BookingStatus::Expired, $this->booking->refresh()->status);
    }

    public function test_un_agent_sans_bookings_cancel_est_refuse(): void
    {
        $this->expire($this->agentWithout($this->agency, Capability::BookingsCancel))->assertForbidden();
    }

    public function test_l_admin_du_role_systeme_garde_le_geste(): void
    {
        $this->expire($this->agencyAdmin($this->agency))->assertOk();
    }

    public function test_le_personnel_d_une_autre_agence_est_refuse(): void
    {
        $this->expire($this->agencyAdmin(Agency::factory()->create()))->assertForbidden();

        $this->assertSame(BookingStatus::Pending, $this->booking->refresh()->status);
    }
}
