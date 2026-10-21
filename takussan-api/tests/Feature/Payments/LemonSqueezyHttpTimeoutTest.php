<?php

namespace Tests\Feature\Payments;

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
 * P65.02 (TCK-1075) — les deux appels de l'initiation Lemon Squeezy (`GET stores/{id}`, TCK-735,
 * puis `POST checkouts`) passent par `LemonSqueezy::api()`, qui ne pose aucun délai : les défauts de
 * Laravel s'appliquaient, 30 s chacun, soit 60 s, la borne même de `max_execution_time`. Le pilote
 * leur donne un délai explicite, et le rend ensuite : les autres appels HTTP n'en héritent pas.
 */
class LemonSqueezyHttpTimeoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_deux_appels_de_l_initiation_portent_un_delai_explicite(): void
    {
        Http::preventStrayRequests();
        $options = [];
        Http::fake(function (Request $request, array $sent) use (&$options) {
            $options[parse_url($request->url(), PHP_URL_PATH)] = $sent;

            return str_contains($request->url(), '/v1/stores/')
                ? Http::response(['data' => ['id' => '7', 'type' => 'stores', 'attributes' => ['currency' => 'EUR']]], 200)
                : Http::response(['data' => ['id' => '99', 'attributes' => ['url' => 'https://takussan.lemonsqueezy.com/buy/abc-123']]], 201);
        });

        $agency = Agency::factory()->create();
        $integration = Integration::factory()->create([
            'provider' => 'lemon_squeezy',
            'agency_id' => $agency->id,
            'credentials' => ['api_key' => 'ls_test', 'signing_secret' => 'sig', 'store_id' => '7', 'variant_id' => '42'],
        ]);
        $booking = Booking::factory()->create(['property_id' => Property::factory()->create(['agency_id' => $agency->id])->id, 'agency_id' => $agency->id]);
        $payment = BookingPayment::factory()->create(['booking_id' => $booking->id, 'amount' => 45.00, 'currency' => Currency::EUR]);

        (new LemonSqueezyDriver($integration))->initiate($payment, 4500, 'EUR');

        $this->assertSame(['/v1/stores/7', '/v1/checkouts'], array_keys($options));
        foreach ($options as $path => $sent) {
            $this->assertSame(LemonSqueezyDriver::CONNECT_TIMEOUT_SECONDS, $sent['connect_timeout'] ?? null, $path);
            $this->assertSame(LemonSqueezyDriver::TIMEOUT_SECONDS, $sent['timeout'] ?? null, $path);
        }

        // Rendu après l'initiation : un appel suivant garde les défauts.
        Http::get('https://api.lemonsqueezy.com/v1/stores/8');
        $this->assertSame(30, $options['/v1/stores/8']['timeout'] ?? null);
    }
}
