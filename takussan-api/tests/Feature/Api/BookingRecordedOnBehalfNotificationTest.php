<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\EnvoisParCode;
use Tests\TestCase;

/**
 * TCK-2579 (ADR-0102 §2) — le client est prévenu qu'une demande a été enregistrée en son nom :
 * son compte s'il en a un, sinon le téléphone de sa fiche. L'auteur n'est pas prévenu ; le
 * bailleur et l'agent du bien le restent (`NotifyOnBookingRequested`).
 *
 * Avant : `NotifyOnBookingRequested` excluait le client, et rien d'autre ne le prévenait.
 */
class BookingRecordedOnBehalfNotificationTest extends TestCase
{
    use EnvoisParCode, RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $landlord;

    private Property $monthly;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $this->monthly = Property::factory()->published()->create([
            'user_id' => $this->landlord->id,
            'agency_id' => $this->agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => '350000',
            'currency' => Currency::XOF,
            'title' => 'Appartement Mermoz',
        ]);
    }

    private function recordFor(Customer $customer): TestResponse
    {
        Sanctum::actingAs($this->agent);

        return $this->postJson('/api/bookings', [
            'kind' => 'application',
            'property_id' => $this->monthly->id,
            'customer_id' => $customer->id,
            'start_date' => '2026-12-01',
        ])->assertCreated();
    }

    public function test_a_customer_with_an_account_is_notified_and_the_author_is_not(): void
    {
        $client = User::factory()->create(['phone_verified_at' => now()]);
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $client->id]);

        $this->recordFor($customer);
        $booking = Booking::query()->sole();

        Notification::assertSentToTimes($client, CodedNotification::class, 1);
        Notification::assertSentTo($client, CodedNotification::class, function (CodedNotification $n) use ($booking) {
            return $n->code === NotificationCode::BookingRecordedOnBehalf
                && ($n->target['id'] ?? null) === $booking->id;
        });
        $this->assertSame(0, self::nombreDEnvois($this->agent, NotificationCode::BookingRecordedOnBehalf));
        $this->assertSame(0, Notification::sent($this->agent, CodedNotification::class)->count(), 'l\'auteur ne s\'annonce pas son geste');
        // Le bailleur reste prévenu de la demande, et jamais de l'avis au client.
        $this->assertSame(1, Notification::sent($this->landlord, CodedNotification::class)->count());
        $this->assertSame(0, self::nombreDEnvois($this->landlord, NotificationCode::BookingRecordedOnBehalf));
        $this->assertCount(0, self::envoisALaDemande(NotificationCode::BookingRecordedOnBehalf), 'téléphone vérifié : pas de relais');
    }

    public function test_a_customer_without_an_account_gets_an_sms_on_the_phone_of_the_record(): void
    {
        $customer = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'user_id' => null,
            'phone' => '+221 77 123 45 67',
        ]);

        $this->recordFor($customer);

        $envois = self::envoisALaDemande(NotificationCode::BookingRecordedOnBehalf);
        $this->assertCount(1, $envois);
        $this->assertSame('+221771234567', $envois->first()[2]->routes['sms']);
        $this->assertSame('Appartement Mermoz', $envois->first()[0]->params['property']);
        $this->assertSame(Booking::query()->sole()->reference_number, $envois->first()[0]->params['reference']);
    }

    public function test_a_booking_made_by_the_customer_for_themself_notifies_them_of_nothing_new(): void
    {
        $daily = Property::factory()->published()->create([
            'agency_id' => $this->agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
            'price' => '20000',
        ]);
        $client = User::factory()->create();
        Sanctum::actingAs($client);

        $this->postJson('/api/bookings', [
            'property_id' => $daily->id,
            'start_date' => '2026-12-01',
            'end_date' => '2026-12-03',
        ])->assertCreated()->assertJsonPath('data.recorded_by_staff', false);

        $this->assertSame(0, self::nombreDEnvois($client, NotificationCode::BookingRecordedOnBehalf));
        $this->assertCount(0, self::envoisALaDemande(NotificationCode::BookingRecordedOnBehalf));
    }

    public function test_a_collaborating_agent_of_the_property_is_still_told_of_the_request(): void
    {
        $collaborator = User::factory()->withAgentProfile($this->agency)->create();
        $this->monthly->collaborators()->create(['user_id' => $collaborator->id, 'role' => CollaboratorRole::Agent->value, 'accepted_at' => now()]);
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => null, 'phone' => '+221 77 123 45 67']);

        $this->recordFor($customer);

        $this->assertSame(1, self::nombreDEnvois($collaborator, NotificationCode::BookingRequestedUndated));
    }
}
