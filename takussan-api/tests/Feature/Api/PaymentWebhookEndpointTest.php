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
use App\Models\IntegrationWebhookLog;
use App\Models\Property;
use App\Models\User;
use App\Services\Payments\Drivers\OrangeMoneyDriver;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-293 (ADR-0046) — l'URL de webhook d'une intégration : sa résolution, son 404 unique, son
 * jeton (stockage, fuite, régénération), le périmètre du rapprochement au-delà de l'agence, et
 * l'ancienne route. `PaymentWebhookMultiTenantTest` porte AC1 à AC3.
 */
class PaymentWebhookEndpointTest extends ApiTestCase
{
    use RefreshDatabase;

    private const SECRET = 'wave_secret_293';

    protected function setUp(): void
    {
        parent::setUp();
        // Aucun appel sortant : le `.env` déclare de vrais pilotes.
        Http::preventStrayRequests();
    }

    // ─── Le 404 unique ───────────────────────────────────────────

    /**
     * Jeton inconnu, jeton d'un autre fournisseur, intégration désactivée, supprimée, fournisseur
     * inconnu, jeton mal formé : le MÊME 404, octet pour octet, et rien de muté.
     */
    public function test_every_unresolvable_url_renders_the_same_404_and_mutates_nothing(): void
    {
        [$payment, $integration] = $this->arrange();
        $inactive = $this->waveIntegration(Agency::factory()->create(), ['is_active' => false]);
        $deleted = $this->waveIntegration(Agency::factory()->create());
        $deletedToken = $deleted->webhook_token;
        $deleted->delete();
        $body = $this->paidBody($payment->transaction_id);

        $urls = [
            'jeton inconnu' => '/api/webhooks/payments/wave/'.str_repeat('x', 48),
            'jeton d\'un autre fournisseur' => '/api/webhooks/payments/orange_money/'.$integration->webhook_token,
            'intégration désactivée' => '/api/webhooks/payments/wave/'.$inactive->webhook_token,
            'intégration supprimée' => '/api/webhooks/payments/wave/'.$deletedToken,
            'fournisseur inconnu' => '/api/webhooks/payments/paypal/'.$integration->webhook_token,
            'jeton mal formé' => '/api/webhooks/payments/wave/%2E%2E',
        ];

        $bodies = [];
        foreach ($urls as $label => $url) {
            $response = $this->signedPost($url, $body, self::SECRET);
            $this->assertSame(404, $response->getStatusCode(), $label);
            $bodies[$label] = $response->getContent();
        }

        $this->assertCount(1, array_unique($bodies), 'Le corps du 404 diffère : '.json_encode($bodies));
        $this->assertSame('webhook.endpoint_unknown', json_decode((string) reset($bodies), true)['code'] ?? null);
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
        // TCK-602 (ADR-0051 §4) — chaque appel est journalisé AVANT tout traitement, et rejeté :
        // aucune autorité, aucun rattachement, aucun jeton dans une colonne.
        $logs = IntegrationWebhookLog::query()->get();
        $this->assertCount(count($urls), $logs);
        foreach ($logs as $log) {
            $this->assertSame(IntegrationWebhookLog::STATUS_REJECTED, $log->status);
            $this->assertSame(404, $log->http_status);
            $this->assertNull($log->authenticated_at);
            $this->assertNull($log->integration_id);
            $this->assertNull($log->agency_id);
        }
        $raw = json_encode(DB::table('integration_webhook_logs')->get());
        foreach ([$integration->webhook_token, $inactive->webhook_token, $deletedToken] as $token) {
            $this->assertStringNotContainsString($token, $raw);
        }
    }

    // ─── Le jeton ────────────────────────────────────────────────

    /** Stocké haché pour la recherche et chiffré pour la relecture ; jamais en clair. */
    public function test_the_token_is_stored_hashed_and_encrypted_never_in_clear(): void
    {
        $integration = $this->waveIntegration(Agency::factory()->create());
        $token = $integration->webhook_token;

        $this->assertMatchesRegularExpression('/^[A-Za-z0-9]{48}$/', $token);
        $row = DB::table('integrations')->where('id', $integration->id)->first();
        $this->assertSame(hash('sha256', $token), $row->webhook_token_hash);
        $this->assertStringNotContainsString($token, (string) $row->webhook_token);
        $this->assertStringNotContainsString($token, json_encode($row));
    }

    /** Une intégration hors paiement n'a pas de jeton : aucune URL ne la désigne. */
    public function test_a_non_payment_integration_has_no_token(): void
    {
        $sms = Integration::factory()->create(['provider' => 'sms_orange']);

        $this->assertNull($sms->webhook_token_hash);
        $this->assertNull($sms->webhookUrl());
    }

    /** Ni `toArray()`, ni la liste de l'agence, ni `fields[]` ne sortent le jeton. */
    public function test_the_token_never_leaves_through_serialisation_list_or_sparse_fieldsets(): void
    {
        $agency = Agency::factory()->create();
        $integration = $this->waveIntegration($agency);
        $token = $integration->webhook_token;
        $this->actingAsAgencyAdmin($agency);

        $this->assertStringNotContainsString($token, json_encode($integration->toArray()));
        $this->assertStringNotContainsString($integration->webhook_token_hash, json_encode($integration->toArray()));

        $list = $this->getJson('/api/integrations')->assertOk()->getContent();
        $this->assertStringNotContainsString($token, $list);
        $this->assertStringNotContainsString(hash('sha256', $token), $list);

        $this->getJson('/api/integrations?fields[integrations]=id,webhook_token')->assertStatus(400);
        $this->getJson('/api/integrations?fields[integrations]=id,webhook_token_hash')->assertStatus(400);
    }

    /**
     * Un webhook traité, rejeté ou sans payable, et une régénération : le jeton n'apparaît dans
     * aucune ligne de journal, ni dans `activity_log`, ni dans le journal des webhooks.
     */
    public function test_the_token_is_never_logged(): void
    {
        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $e) use (&$logged): void {
            $logged[] = $e->message.' '.json_encode($e->context);
        });

        $agency = Agency::factory()->create();
        [$payment, $integration] = $this->arrange($agency);
        $token = $integration->webhook_token;

        $this->signedPost($this->uri($integration), $this->paidBody('txn_inconnu'), self::SECRET)->assertOk();
        $this->signedPost($this->uri($integration), $this->paidBody($payment->transaction_id), 'mauvais')->assertStatus(401);
        $this->signedPost($this->uri($integration), $this->paidBody($payment->transaction_id), self::SECRET)->assertOk();

        $this->actingAsAgencyAdmin($agency);
        $this->postJson("/api/integrations/{$integration->id}/webhook-endpoint")->assertOk();
        $newToken = $integration->refresh()->webhook_token;

        $traces = implode("\n", $logged)
            .json_encode(Activity::query()->get()->toArray())
            .json_encode(IntegrationWebhookLog::query()->get()->toArray());
        $this->assertNotEmpty($logged, 'Le webhook sans payable doit laisser une trace (TCK-593).');
        foreach ([$token, $newToken] as $secret) {
            $this->assertStringNotContainsString($secret, $traces);
        }
    }

    // ─── Régénération ────────────────────────────────────────────

    /** Régénérer : l'ancienne URL rend le 404 commun, la nouvelle passe. */
    public function test_regeneration_invalidates_the_previous_token_at_once(): void
    {
        $agency = Agency::factory()->create();
        [$payment, $integration] = $this->arrange($agency);
        $oldUri = $this->uri($integration);
        $this->actingAsAgencyAdmin($agency);

        $response = $this->postJson("/api/integrations/{$integration->id}/webhook-endpoint")->assertOk();

        $integration->refresh();
        $this->assertSame($integration->webhookUrl(), $response->json('data.url'));
        $this->assertStringNotContainsString($oldUri, (string) $response->json('data.url'));

        $this->signedPost($oldUri, $this->paidBody($payment->transaction_id), self::SECRET)->assertNotFound();
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);

        $this->signedPost($this->uri($integration), $this->paidBody($payment->transaction_id), self::SECRET)->assertOk();
        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    /**
     * Second chemin de « changement de titulaire » : un changement de fournisseur ou d'agence, même
     * par une écriture directe du modèle, tire un jeton neuf.
     */
    public function test_a_change_of_provider_or_agency_rotates_the_token(): void
    {
        $integration = $this->waveIntegration(Agency::factory()->create());
        $first = $integration->webhook_token_hash;

        $integration->update(['provider' => 'orange_money']);
        $second = $integration->refresh()->webhook_token_hash;
        $this->assertNotNull($second);
        $this->assertNotSame($first, $second);

        $integration->update(['agency_id' => Agency::factory()->create()->id]);
        $this->assertNotSame($second, $integration->refresh()->webhook_token_hash);

        $integration->update(['provider' => 'sms_orange']);
        $this->assertNull($integration->refresh()->webhook_token_hash);
    }

    /** Lire et régénérer : l'admin de l'agence de l'intégration et le super-admin, personne d'autre. */
    public function test_only_who_may_update_the_integration_reads_or_rotates_its_url(): void
    {
        $agencyA = Agency::factory()->create();
        $integration = $this->waveIntegration($agencyA);
        $hash = $integration->webhook_token_hash;

        $this->actingAsAgencyAdmin(Agency::factory()->create());
        $this->getJson("/api/integrations/{$integration->id}/webhook-endpoint")->assertForbidden();
        $this->postJson("/api/integrations/{$integration->id}/webhook-endpoint")->assertForbidden();

        $agent = User::factory()->create(['agency_id' => $agencyA->id]);
        $this->materializeRoleProfile($agent, 'agent', $agencyA);
        Sanctum::actingAs($agent);
        $this->getJson("/api/integrations/{$integration->id}/webhook-endpoint")->assertForbidden();
        $this->postJson("/api/integrations/{$integration->id}/webhook-endpoint")->assertForbidden();
        $this->assertSame($hash, $integration->refresh()->webhook_token_hash);

        $this->actingAsAgencyAdmin($agencyA);
        $this->getJson("/api/integrations/{$integration->id}/webhook-endpoint")
            ->assertOk()
            ->assertJsonPath('data.url', $integration->webhookUrl())
            ->assertJsonPath('data.provider', 'wave');

        $this->apiActingAsRole('super_admin');
        $this->getJson("/api/integrations/{$integration->id}/webhook-endpoint")->assertOk();
    }

    /** Une intégration hors paiement n'a pas d'URL à lire ni à régénérer. */
    public function test_a_non_payment_integration_has_no_endpoint(): void
    {
        $agency = Agency::factory()->create();
        $sms = Integration::factory()->create(['agency_id' => $agency->id, 'provider' => 'sms_orange']);
        $this->actingAsAgencyAdmin($agency);

        $this->getJson("/api/integrations/{$sms->id}/webhook-endpoint")->assertStatus(422)->assertJsonPath('code', 'integration.not_payment');
        $this->postJson("/api/integrations/{$sms->id}/webhook-endpoint")->assertStatus(422);
        $this->assertNull($sms->refresh()->webhook_token_hash);
    }

    /** Régénérer est un geste protégé : un admin d'agence sans 2FA est refusé, et rien ne change. */
    public function test_rotation_requires_the_second_factor(): void
    {
        $agency = Agency::factory()->create();
        $integration = $this->waveIntegration($agency);
        $hash = $integration->webhook_token_hash;
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        Sanctum::actingAs($admin);

        // Le code, et pas seulement le 403 : c'est lui que l'écran confie à `GardeDoubleFacteur`.
        $this->postJson("/api/integrations/{$integration->id}/webhook-endpoint")
            ->assertForbidden()
            ->assertJsonPath('code', 'two_factor_required');
        $this->assertSame($hash, $integration->refresh()->webhook_token_hash);
    }

    // ─── Le périmètre au-delà de l'agence ────────────────────────

    /**
     * ADR-0046 §5 — un checkout de A encaissé par l'intégration de la PLATEFORME ne se solde pas
     * avec l'URL et le secret de A, alors que l'agence correspond ; la plateforme, elle, le solde.
     */
    public function test_a_checkout_initiated_by_the_platform_is_settled_only_by_the_platform(): void
    {
        $agency = Agency::factory()->create();
        [$payment, $own] = $this->arrange($agency);
        $platform = Integration::factory()->create([
            'agency_id' => null,
            'provider' => 'wave',
            'credentials' => ['api_key' => 'k', 'webhook_secret' => 'platform_secret'],
        ]);
        $payment->forceFill(['metadata' => ['gateway' => [
            'provider' => 'wave',
            'transaction_id' => $payment->transaction_id,
            'integration_id' => $platform->id,
            'transactions' => [['transaction_id' => $payment->transaction_id, 'provider' => 'wave', 'integration_id' => $platform->id, 'amount' => 50000]],
        ]]])->save();

        $this->signedPost($this->uri($own), $this->paidBody($payment->transaction_id), self::SECRET)->assertOk();
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);

        $this->signedPost($this->uri($platform), $this->paidBody($payment->transaction_id), 'platform_secret')->assertOk();
        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    /** Et l'inverse : la plateforme ne solde pas un checkout initié par l'intégration de l'agence. */
    public function test_the_platform_does_not_settle_a_checkout_initiated_by_an_agency_integration(): void
    {
        $agency = Agency::factory()->create();
        [$payment, $own] = $this->arrange($agency);
        $platform = Integration::factory()->create([
            'agency_id' => null,
            'provider' => 'wave',
            'credentials' => ['api_key' => 'k', 'webhook_secret' => 'platform_secret'],
        ]);
        $payment->forceFill(['metadata' => ['gateway' => [
            'provider' => 'wave',
            'transaction_id' => $payment->transaction_id,
            'integration_id' => $own->id,
        ]]])->save();

        $this->signedPost($this->uri($platform), $this->paidBody($payment->transaction_id), 'platform_secret')->assertOk();
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
    }

    /** `initiate` note l'intégration qui initie, sur la ligne et dans l'historique du checkout. */
    public function test_initiation_records_the_initiating_integration(): void
    {
        Http::fake(['*/v1/checkout/sessions' => Http::response(['id' => 'cs_new', 'wave_launch_url' => 'https://pay.wave.com/c/cs_new'])]);
        $agency = Agency::factory()->create();
        [$payment, $integration] = $this->arrange($agency);
        $payment->forceFill(['transaction_id' => null, 'metadata' => []])->save();
        $customer = User::factory()->create();
        $payment->booking->customer->forceFill(['user_id' => $customer->id])->save();
        $this->actingAsAgencyAdmin($agency);

        $this->postJson("/api/booking-payments/{$payment->id}/initiate", ['provider' => 'wave'])->assertOk();

        $gateway = $payment->refresh()->metadata['gateway'];
        $this->assertSame($integration->id, $gateway['integration_id']);
        $this->assertSame($integration->id, $gateway['transactions'][0]['integration_id']);
    }

    /**
     * Le chemin `custom_data` désigne un payable par son identifiant : il reste borné par l'autorité.
     * Seul l'écouteur du paquet Lemon Squeezy remplit `custom_data` aujourd'hui (autorité plateforme) ;
     * la borne d'agence est posée pour l'événement qui en porterait sous une autorité d'agence.
     */
    public function test_the_custom_data_path_stays_within_the_agency_authority(): void
    {
        $agencyA = Agency::factory()->create();
        [$payment, $integrationA] = $this->arrange($agencyA);
        $integrationB = $this->waveIntegration(Agency::factory()->create());
        $event = new PaymentEvent('lemon_squeezy', PaymentEvent::TYPE_PAID, 'ord_custom', [
            'custom_data' => ['payment_id' => (string) $payment->id, 'payment_type' => BookingPayment::class],
        ]);
        $gateway = app(PaymentGatewayService::class);

        $gateway->applyEventToMatchingPayment($event->authenticatedBy(WebhookAuthority::of($integrationB)));
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);

        $gateway->applyEventToMatchingPayment($event->authenticatedBy(WebhookAuthority::of($integrationA)));
        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    /**
     * Et seulement vers les trois payables : `custom_data.payment_type` est une donnée du fournisseur,
     * pas une classe à instancier. Un nom de modèle arbitraire ne désigne rien.
     */
    public function test_the_custom_data_path_accepts_only_the_three_payables(): void
    {
        Integration::factory()->create([
            'agency_id' => null,
            'provider' => 'lemon_squeezy',
            'credentials' => ['api_key' => 'k', 'signing_secret' => 'ls', 'store_id' => 's', 'variant_id' => 'v'],
        ]);
        $user = User::factory()->create();
        $before = $user->fresh()->getAttributes();

        $event = app(PaymentGatewayService::class)->handleWebhookEvent('order_created', [
            'meta' => ['event_name' => 'order_created', 'custom_data' => ['payment_id' => (string) $user->id, 'payment_type' => User::class]],
            'data' => ['id' => 'ord_user', 'attributes' => []],
        ]);

        $this->assertNotNull($event);
        $this->assertSame($before, $user->fresh()->getAttributes());
    }

    /** ADR-0046 §5 — un événement qui ne dit pas qui l'a authentifié ne rapproche rien. */
    public function test_an_event_without_authority_reconciles_nothing(): void
    {
        [$payment] = $this->arrange();
        $gateway = app(PaymentGatewayService::class);

        $gateway->applyEventToMatchingPayment(new PaymentEvent('wave', PaymentEvent::TYPE_PAID, $payment->transaction_id));
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);

        $gateway->applyEventToMatchingPayment(
            (new PaymentEvent('wave', PaymentEvent::TYPE_PAID, $payment->transaction_id))->authenticatedBy(WebhookAuthority::platform()),
        );
        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    // ─── Rejeu, limiteur, ancienne route ─────────────────────────

    /** Le même webhook rejoué : un seul événement enregistré, un seul effet. */
    public function test_a_replayed_webhook_is_applied_once(): void
    {
        [$payment, $integration] = $this->arrange();
        $body = $this->paidBody($payment->transaction_id);
        $signature = $this->waveSignature($body, self::SECRET);

        $this->signedPost($this->uri($integration), $body, self::SECRET, $signature)->assertOk();
        $this->signedPost($this->uri($integration), $body, self::SECRET, $signature)->assertOk();

        $this->assertCount(1, $payment->refresh()->metadata['gateway_events']);
        $this->assertSame(PaymentStatus::Paid, $payment->status);
    }

    /** La route est limitée : la 61ᵉ requête d'une minute, même sur un jeton inconnu, rend 429. */
    public function test_the_route_is_throttled(): void
    {
        $uri = '/api/webhooks/payments/wave/'.str_repeat('y', 48);
        for ($i = 0; $i < 60; $i++) {
            $this->postJson($uri, [])->assertNotFound();
        }

        $this->postJson($uri, [])->assertStatus(429);
    }

    /** ADR-0046 §8 — l'ancienne URL rend 410 sans rien muter, même signée par un secret valide. */
    public function test_the_former_url_is_gone_and_mutates_nothing(): void
    {
        [$payment] = $this->arrange();

        $this->signedPost('/api/webhooks/payments/wave', $this->paidBody($payment->transaction_id), self::SECRET)
            ->assertStatus(410)
            ->assertJsonPath('code', 'webhook.endpoint_gone');

        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
        $this->assertSame(0, IntegrationWebhookLog::query()->count());
    }

    // ─── Orange Money ────────────────────────────────────────────

    /** ADR-0046 §4 — `notif_url` porte l'URL de l'intégration qui initie ; l'appelant ne la remplace pas. */
    public function test_orange_money_notif_url_is_the_url_of_the_initiating_integration(): void
    {
        Http::fake(['*/orange-money-webpay/v1/webpayment' => Http::response(['payment_url' => 'https://om.example/p', 'pay_token' => 'om_tok'])]);
        $agency = Agency::factory()->create();
        [$payment] = $this->arrange($agency);
        $om = Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => 'orange_money',
            'credentials' => ['access_token' => 'at', 'merchant_key' => 'mk', 'webhook_secret' => 's'],
        ]);

        (new OrangeMoneyDriver($om))->initiate($payment, 5_000_000, 'XOF', ['notif_url' => 'https://evil.example/hook']);

        Http::assertSent(function ($request) use ($om): bool {
            return $request['notif_url'] === $om->webhookUrl()
                && str_ends_with((string) $request['notif_url'], '/api/webhooks/payments/orange_money/'.$om->webhook_token);
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────

    /** @return array{0: BookingPayment, 1: Integration} */
    private function arrange(?Agency $agency = null): array
    {
        $agency ??= Agency::factory()->create();
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'agency_id' => $agency->id,
            'currency' => Currency::XOF,
        ]);
        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 50000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'transaction_id' => 'cs_293_'.$agency->id,
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => 'cs_293_'.$agency->id]],
        ]);

        return [$payment, $this->waveIntegration($agency)];
    }

    /** @param  array<string, mixed>  $attributes */
    private function waveIntegration(Agency $agency, array $attributes = []): Integration
    {
        return Integration::factory()->create($attributes + [
            'agency_id' => $agency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => self::SECRET],
        ]);
    }

    private function uri(Integration $integration): string
    {
        return '/api/webhooks/payments/'.$integration->provider.'/'.$integration->webhook_token;
    }

    private function paidBody(string $transactionId): string
    {
        return json_encode(['type' => 'checkout.session.completed', 'data' => ['id' => $transactionId]]);
    }

    private function waveSignature(string $body, string $secret): string
    {
        $ts = time();

        return "t={$ts},v1=".hash_hmac('sha256', $ts.'.'.$body, $secret);
    }

    private function signedPost(string $uri, string $body, string $secret, ?string $signature = null): TestResponse
    {
        return $this->call('POST', $uri, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_WAVE_SIGNATURE' => $signature ?? $this->waveSignature($body, $secret),
        ], $body);
    }

    private function actingAsAgencyAdmin(Agency $agency): User
    {
        $admin = User::factory()->withTwoFactor()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        Sanctum::actingAs($admin);

        return $admin;
    }
}
