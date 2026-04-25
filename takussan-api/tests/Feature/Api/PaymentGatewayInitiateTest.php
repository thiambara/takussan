<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PaymentGatewayInitiateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();

        // Default: respond OK to common gateway URLs. Individual tests override.
        Http::fake([
            'api.wave.com/*' => Http::response([
                'id' => 'cs_wave_123',
                'wave_launch_url' => 'https://pay.wave.com/c/cs_wave_123',
                'amount' => '50000',
                'currency' => 'XOF',
            ], 200),
            'api.orange.com/*' => Http::response([
                'pay_token' => 'om_token_abc',
                'payment_url' => 'https://webpayment.orange-money.com/pay/om_token_abc',
                'notif_token' => 'om_notif_abc',
            ], 200),
        ]);
    }

    /**
     * Build a fully-populated booking + payment with active integration.
     *
     * @return array{owner: User, booking: Booking, payment: BookingPayment, agency: Agency}
     */
    protected function makeContext(string $provider = 'wave', string $currency = 'XOF', array $credentials = []): array
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->create(['agency_id' => $agency->id]);
        $property = Property::factory()->create([
            'user_id' => $owner->id,
            'agency_id' => $agency->id,
        ]);
        $customer = Customer::factory()->create();
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'agency_id' => $agency->id,
            'currency' => Currency::tryFrom($currency) ?? Currency::XOF,
        ]);

        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 50000,
            'currency' => Currency::tryFrom($currency) ?? Currency::XOF,
            'status' => PaymentStatus::Pending,
            'payment_type' => BookingPaymentType::Deposit,
        ]);

        Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => $provider,
            'is_active' => true,
            'credentials' => $credentials !== [] ? $credentials : [
                'api_key' => 'wave_test_key',
                'webhook_secret' => 'wave_secret',
                'access_token' => 'om_token',
                'merchant_key' => 'om_merchant',
                'store_id' => 'ls_store',
                'variant_id' => 'ls_variant',
                'signing_secret' => 'ls_secret',
            ],
        ]);

        return ['owner' => $owner, 'booking' => $booking, 'payment' => $payment, 'agency' => $agency];
    }

    public function test_owner_can_initiate_wave_checkout(): void
    {
        $ctx = $this->makeContext('wave');
        Sanctum::actingAs($ctx['owner']);

        $response = $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'wave',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.provider', 'wave')
            ->assertJsonPath('data.checkout_url', 'https://pay.wave.com/c/cs_wave_123')
            ->assertJsonPath('data.transaction_id', 'cs_wave_123');

        $ctx['payment']->refresh();
        $this->assertSame('cs_wave_123', $ctx['payment']->transaction_id);
        $this->assertSame('wave', $ctx['payment']->metadata['gateway']['provider'] ?? null);
    }

    public function test_owner_can_initiate_orange_money_checkout(): void
    {
        $ctx = $this->makeContext('orange_money');
        Sanctum::actingAs($ctx['owner']);

        $response = $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'orange_money',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.provider', 'orange_money')
            ->assertJsonPath('data.transaction_id', 'om_token_abc');
    }

    public function test_initiate_returns_404_when_integration_missing(): void
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->create(['agency_id' => $agency->id]);
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id]);
        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'currency' => Currency::XOF,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/booking-payments/{$payment->id}/initiate", ['provider' => 'wave'])
            ->assertNotFound();
    }

    public function test_initiate_rejects_xof_for_lemon_squeezy(): void
    {
        $ctx = $this->makeContext('lemon_squeezy', 'XOF');
        Sanctum::actingAs($ctx['owner']);

        $response = $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'lemon_squeezy',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('Lemon Squeezy', (string) $response->json('message'));
    }

    public function test_initiate_rejects_eur_for_wave(): void
    {
        $ctx = $this->makeContext('wave', 'EUR');
        Sanctum::actingAs($ctx['owner']);

        $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'wave',
        ])->assertStatus(422);
    }

    public function test_random_user_cannot_initiate(): void
    {
        $ctx = $this->makeContext('wave');
        $intruder = User::factory()->create();

        Sanctum::actingAs($intruder);

        $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'wave',
        ])->assertForbidden();
    }

    public function test_initiate_only_uses_agency_scoped_integration(): void
    {
        $ctx = $this->makeContext('wave');
        $otherAgency = Agency::factory()->create();
        // Add another integration on a different agency — must not be picked.
        Integration::factory()->create([
            'agency_id' => $otherAgency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'foreign'],
        ]);

        Sanctum::actingAs($ctx['owner']);

        $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'wave',
        ])->assertOk();
    }
}
