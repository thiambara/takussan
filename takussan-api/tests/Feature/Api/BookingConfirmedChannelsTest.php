<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2874 (AC4, maquette e7 « prévenu par SMS et e-mail ») — MESURE, par le chemin réel
 * (`POST /api/bookings/{id}/confirm` → `BookingService::confirm`), préférences par défaut :
 *
 * - un client au mobile VÉRIFIÉ et à l'e-mail reçoit `booking.confirmed` par l'e-mail ET par un canal
 *   mobile — WhatsApp d'abord (`PreferenceResolver::resolveMobileChannel`, `booking_status_changed`
 *   est un événement mobile par défaut), le SMS quand il a dit que son numéro ne reçoit pas WhatsApp ;
 * - un mobile NON vérifié ne reçoit aucun canal mobile (règle de `shouldSend`, inchangée) : l'e-mail seul.
 */
class BookingConfirmedChannelsTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<string> les canaux de `booking.confirmed` vers le client */
    private function canauxDeLaConfirmation(array $client): array
    {
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');

        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $user = User::factory()->create($client + ['email' => 'awa@example.sn', 'phone' => '+221771234567']);
        $customer = Customer::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        $monthly = Property::factory()->published()->create([
            'agency_id' => $agency->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
        ]);
        Sanctum::actingAs($agent);
        $id = $this->postJson('/api/bookings', [
            'kind' => 'application', 'property_id' => $monthly->id, 'customer_id' => $customer->id, 'start_date' => '2026-12-01',
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/bookings/{$id}/confirm")->assertOk()->assertJsonPath('data.status', 'confirmed');

        $canaux = null;
        Notification::assertSentTo($user, CodedNotification::class, function (CodedNotification $n, array $channels) use (&$canaux) {
            if ($n->code !== NotificationCode::BookingConfirmed) {
                return false;
            }
            $canaux = $channels;

            return true;
        });

        return $canaux ?? [];
    }

    public function test_ac4_a_verified_mobile_and_an_email_receive_booking_confirmed_by_both(): void
    {
        $canaux = $this->canauxDeLaConfirmation(['phone_verified_at' => now()]);

        $this->assertContains('mail', $canaux);
        $this->assertContains('whatsapp', $canaux, 'le canal mobile, WhatsApp d\'abord');
    }

    public function test_ac4_the_mobile_channel_is_the_sms_when_the_number_has_no_whatsapp(): void
    {
        $canaux = $this->canauxDeLaConfirmation(['phone_verified_at' => now(), 'phone_whatsapp' => false]);

        $this->assertSame(['mail', 'sms'], array_values(array_intersect($canaux, ['mail', 'sms', 'whatsapp'])));
    }

    public function test_an_unverified_mobile_receives_the_email_only(): void
    {
        $canaux = $this->canauxDeLaConfirmation(['phone_verified_at' => null]);

        $this->assertContains('mail', $canaux);
        $this->assertNotContains('sms', $canaux);
        $this->assertNotContains('whatsapp', $canaux);
    }
}
