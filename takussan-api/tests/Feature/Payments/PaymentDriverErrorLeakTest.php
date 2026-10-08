<?php

namespace Tests\Feature\Payments;

use App\Models\Integration;
use App\Models\LeasePayment;
use App\Services\Payments\Drivers\OrangeMoneyDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §3, AC27) — un pilote ne renvoie jamais au client le corps de réponse du
 * fournisseur, ni le nom d'une clé manquante : 502 `payment.provider_unavailable`, 500
 * `payment.integration_misconfigured`, le détail reste au journal du serveur.
 */
class PaymentDriverErrorLeakTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    private const SECRET = 'UPSTREAM-SECRET-42';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    /** @return array<string, mixed> */
    private function withOrangeMoney(): array
    {
        $ctx = $this->leaseDue();
        Integration::factory()->create([
            'agency_id' => $ctx['agency']->id,
            'provider' => 'orange_money',
            'is_active' => true,
            'credentials' => array_fill_keys(OrangeMoneyDriver::CREDENTIAL_KEYS, 'x'),
        ]);
        $this->actingAs($ctx['tenant'], 'sanctum');

        return $ctx;
    }

    private function openCheckout(LeasePayment $payment, string $provider): void
    {
        DB::table('lease_payments')->where('id', $payment->id)->update([
            'transaction_id' => 'txn_leak',
            'metadata' => json_encode(['gateway' => ['provider' => $provider, 'transaction_id' => 'txn_leak']]),
        ]);
    }

    public function test_initiate_and_verify_never_return_the_provider_body(): void
    {
        Log::spy();
        Http::fake([
            '*/oauth/v3/token' => Http::response(['access_token' => 'om_oauth', 'expires_in' => 3600]),
            '*' => Http::response(self::SECRET, 500),
        ]);
        $ctx = $this->withOrangeMoney();
        $path = "/api/lease-payments/{$ctx['payment']->id}";

        foreach (['wave', 'orange_money'] as $provider) {
            $initiate = $this->postJson("{$path}/initiate", ['provider' => $provider])
                ->assertStatus(502)->assertJsonPath('code', 'payment.provider_unavailable');
            $this->assertStringNotContainsString(self::SECRET, $initiate->getContent(), "{$provider} initiate");

            $this->openCheckout($ctx['payment'], $provider);
            $verify = $this->getJson("{$path}/verify")
                ->assertStatus(502)->assertJsonPath('code', 'payment.provider_unavailable');
            $this->assertStringNotContainsString(self::SECRET, $verify->getContent(), "{$provider} verify");
        }

        // Le corps n'est pas perdu : il est au journal du serveur.
        Log::shouldHaveReceived('warning')->withArgs(fn (string $m, array $c = []) => ($c['body'] ?? null) === self::SECRET)->atLeast()->once();
    }

    public function test_an_oauth_failure_is_a_provider_unavailable_without_its_body(): void
    {
        Http::fake(['*/oauth/v3/token' => Http::response(self::SECRET, 401)]);
        $ctx = $this->withOrangeMoney();

        $response = $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'orange_money'])
            ->assertStatus(502)->assertJsonPath('code', 'payment.provider_unavailable');
        $this->assertStringNotContainsString(self::SECRET, $response->getContent());
    }

    public function test_a_missing_credential_is_never_named(): void
    {
        Http::fake();
        $ctx = $this->leaseDue();
        Integration::query()->where('agency_id', $ctx['agency']->id)->get()
            ->each(fn (Integration $i) => $i->forceFill(['credentials' => ['webhook_secret' => 's']])->save());
        $this->openCheckout($ctx['payment'], 'wave');
        $this->actingAs($ctx['tenant'], 'sanctum');

        $response = $this->getJson("/api/lease-payments/{$ctx['payment']->id}/verify")
            ->assertStatus(500)->assertJsonPath('code', 'payment.integration_misconfigured');
        $this->assertStringNotContainsString('api_key', $response->getContent());
        $this->assertArrayNotHasKey('credential', (array) $response->json('params'));
        Http::assertNothingSent();
    }
}
