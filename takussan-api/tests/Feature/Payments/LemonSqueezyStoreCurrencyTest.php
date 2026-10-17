<?php

namespace Tests\Feature\Payments;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\Currency;
use App\Models\Integration;
use App\Models\Property;
use App\Services\Payments\Drivers\LemonSqueezyDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * TCK-735 (pistes P04.07) — Lemon Squeezy facture `custom_price` dans la devise de la BOUTIQUE.
 * Un payable dans une autre devise est refusé à l'initiation, avant toute création de checkout :
 * 4 500 centimes d'un payable en EUR seraient sinon encaissés 45 USD.
 */
class LemonSqueezyStoreCurrencyTest extends TestCase
{
    use RefreshDatabase;

    private const CHECKOUT_URL = 'https://takussan.lemonsqueezy.com/buy/abc-123';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function fakeStore(array $storeAttributes): void
    {
        Http::fake([
            'api.lemonsqueezy.com/v1/stores/*' => Http::response(['data' => ['id' => '7', 'type' => 'stores', 'attributes' => $storeAttributes]], 200),
            'api.lemonsqueezy.com/v1/checkouts' => Http::response(['data' => ['id' => '99', 'attributes' => ['url' => self::CHECKOUT_URL]]], 201),
        ]);
    }

    /** @return array{0: LemonSqueezyDriver, 1: BookingPayment} */
    private function driverAndPayment(): array
    {
        $agency = Agency::factory()->create();
        $integration = Integration::factory()->create([
            'provider' => 'lemon_squeezy',
            'agency_id' => $agency->id,
            'credentials' => ['api_key' => 'ls_test', 'signing_secret' => 'sig', 'store_id' => '7', 'variant_id' => '42'],
        ]);
        $booking = Booking::factory()->create(['property_id' => Property::factory()->create(['agency_id' => $agency->id])->id, 'agency_id' => $agency->id]);
        $payment = BookingPayment::factory()->create(['booking_id' => $booking->id, 'amount' => 45.00, 'currency' => Currency::EUR]);

        return [new LemonSqueezyDriver($integration), $payment];
    }

    private function checkoutWasCreated(): bool
    {
        return Http::recorded(fn (Request $r) => str_ends_with($r->url(), '/v1/checkouts'))->isNotEmpty();
    }

    public function test_un_payable_dans_une_autre_devise_que_la_boutique_est_refuse_sans_checkout(): void
    {
        $this->fakeStore(['name' => 'Takussan', 'currency' => 'USD']);
        [$driver, $payment] = $this->driverAndPayment();

        try {
            $driver->initiate($payment, 4500, 'EUR');
            $this->fail('Un payable en EUR sur une boutique en USD doit être refusé.');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('payment.currency_unsupported', $e->errorCode);
            $this->assertSame(['provider' => 'lemon_squeezy', 'currency' => 'EUR'], $e->params);
        }

        $this->assertFalse($this->checkoutWasCreated(), 'Aucun checkout ne doit être créé.');
    }

    public function test_un_payable_dans_la_devise_de_la_boutique_ouvre_le_checkout(): void
    {
        $this->fakeStore(['name' => 'Takussan', 'currency' => 'EUR']);
        [$driver, $payment] = $this->driverAndPayment();

        $session = $driver->initiate($payment, 4500, 'eur');

        $this->assertSame(self::CHECKOUT_URL, $session->checkoutUrl);
        $this->assertTrue($this->checkoutWasCreated());
    }

    /** Une boutique dont la devise ne se lit pas ne se devine pas : rien n'est encaissé. */
    public function test_une_boutique_sans_devise_lisible_ne_ouvre_aucun_checkout(): void
    {
        $this->fakeStore(['name' => 'Takussan']);
        [$driver, $payment] = $this->driverAndPayment();

        try {
            $driver->initiate($payment, 4500, 'EUR');
            $this->fail('Une devise de boutique illisible doit lever.');
        } catch (ApiError $e) {
            $this->assertSame(502, $e->getStatusCode());
            $this->assertSame('payment.provider_unavailable', $e->errorCode);
        }

        $this->assertFalse($this->checkoutWasCreated());
    }
}
