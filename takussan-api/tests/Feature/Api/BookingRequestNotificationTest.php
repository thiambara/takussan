<?php

namespace Tests\Feature\Api;

use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\ContractType;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-596 (AC18) — une demande de réservation prévient qui doit la traiter, quelle que soit sa
 * porte d'entrée : la demande publique et l'offre d'achat ne prévenaient personne, la demande
 * privée oubliait l'agent du bien.
 */
class BookingRequestNotificationTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /** @return list<int> */
    private function recipientsOf(string $code): array
    {
        return AppNotification::query()->where('code', $code)->orderBy('user_id')->pluck('user_id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return list<int> */
    private function ids(User ...$users): array
    {
        $ids = array_map(static fn (User $u): int => $u->id, $users);
        sort($ids);

        return $ids;
    }

    public function test_public_stay_request_notifies_landlord_and_property_agent_not_the_client(): void
    {
        $this->buildStakeholders();
        Sanctum::actingAs($this->client);

        $this->postJson("/api/public/properties/{$this->property->slug}/booking-request", [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
            'guests' => 2,
        ])->assertCreated();

        $this->assertSame($this->ids($this->landlord, $this->agent), $this->recipientsOf('booking.created'));
    }

    public function test_public_purchase_offer_notifies_landlord_and_property_agent_without_empty_dates(): void
    {
        $this->buildStakeholders(ContractType::Sale);
        Sanctum::actingAs($this->client);

        $this->postJson("/api/public/properties/{$this->property->slug}/booking-request", [
            'offer_amount' => 15_000_000,
            'offer_expires_at' => now()->addDays(10)->toDateString(),
            'terms_accepted' => true,
        ])->assertCreated();

        $this->assertSame($this->ids($this->landlord, $this->agent), $this->recipientsOf('booking.requested_undated'));
        $this->assertSame([], $this->recipientsOf('booking.created'));
    }

    public function test_private_request_by_the_client_notifies_landlord_and_property_agent(): void
    {
        $this->buildStakeholders();
        Sanctum::actingAs($this->client);

        $this->postJson('/api/bookings', [
            'property_id' => $this->property->id,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ])->assertCreated();

        $this->assertSame($this->ids($this->landlord, $this->agent), $this->recipientsOf('booking.created'));
    }

    public function test_private_request_by_the_agent_never_notifies_its_author_nor_the_client(): void
    {
        $this->buildStakeholders();
        $customer = Customer::factory()->create(['user_id' => $this->client->id, 'agency_id' => $this->agency->id]);
        Sanctum::actingAs($this->agent);

        $this->postJson('/api/bookings', [
            'property_id' => $this->property->id,
            'customer_id' => $customer->id,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ])->assertCreated();

        $this->assertSame($this->ids($this->landlord), $this->recipientsOf('booking.created'));
    }

    /**
     * Second chemin : la ligne de collaboration survit au retrait de l'agent. Un agent suspendu,
     * un `viewer` et une invitation non acceptée ne reçoivent ni la référence ni les dates.
     */
    public function test_suspended_agent_viewer_and_pending_collaborator_are_not_notified(): void
    {
        $this->buildStakeholders();
        $suspended = $this->agencyAgent($this->agency);
        AgentProfile::query()->where('user_id', $suspended->id)->update(['status' => 'suspended']);
        $this->collaborate($suspended, CollaboratorRole::Manager);
        $this->collaborate(User::factory()->create(), CollaboratorRole::Viewer);
        $this->collaborate($this->agencyAgent($this->agency), CollaboratorRole::Agent, accepted: false);
        Sanctum::actingAs($this->client);

        $this->postJson("/api/public/properties/{$this->property->slug}/booking-request", [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
            'guests' => 1,
        ])->assertCreated();

        $this->assertSame($this->ids($this->landlord, $this->agent), $this->recipientsOf('booking.created'));
    }
}
