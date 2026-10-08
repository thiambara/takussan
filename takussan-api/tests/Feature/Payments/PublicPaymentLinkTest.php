<?php

namespace Tests\Feature\Payments;

use App\Http\Resources\LeasePaymentResource;
use App\Models\Agency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\LeasePayment;
use App\Models\LeasePaymentLink;
use App\Services\Payments\LeasePaymentLinkService;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §1) — la page publique d'un lien de paiement, `/api/pay/{jeton}`, pour un
 * locataire SANS COMPTE : son échéance, et rien d'autre.
 */
class PublicPaymentLinkTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Notification::fake();
        config()->set('app.frontend_url', 'https://front.test');
    }

    /** @return array{0: array<string, mixed>, 1: string} */
    private function linkFor(?array $settings = null, array $payment = []): array
    {
        $ctx = $this->leaseDue($settings, $payment);
        $tenant = $ctx['lease']->tenant;
        $tenant->forceFill(['user_id' => null, 'first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => '+221771234567'])->save();
        $ctx['lease']->property->address()->create(['street' => '12 rue Secrète', 'neighborhood' => 'Mermoz', 'city' => 'Dakar', 'country' => 'SN']);

        $url = app(LeasePaymentLinkService::class)->urlFor($ctx['payment']);

        return [$ctx, substr($url, strlen('https://front.test/pay/'))];
    }

    /**
     * AC14 — 200 sans compte : montant, titre et quartier du bien, nom de l'agence, fournisseurs de
     * SON agence. Ni le nom ni le téléphone du locataire, ni l'adresse complète, ni un id interne.
     */
    public function test_a_tenant_without_account_reads_only_their_instalment(): void
    {
        [$ctx, $token] = $this->linkFor();
        // Orange Money actif chez une AUTRE agence seulement : pas proposé.
        Integration::factory()->create(['agency_id' => Agency::factory()->create()->id, 'provider' => 'orange_money', 'is_active' => true,
            'credentials' => ['access_token' => 't', 'merchant_key' => 'm', 'webhook_secret' => 's']]);

        $response = $this->getJson("/api/pay/{$token}")->assertOk();

        $response->assertJsonPath('data.reference', $ctx['payment']->reference_number)
            ->assertJsonPath('data.property.title', $ctx['lease']->property->title)
            ->assertJsonPath('data.property.neighborhood', 'Mermoz')
            ->assertJsonPath('data.agency.name', $ctx['agency']->name)
            ->assertJsonPath('data.providers', ['wave']);
        $body = $response->getContent();
        foreach (['Awa', 'Ndiaye', '771234567', '12 rue Secrète', '"id"', '"lease_id"', '"agency_id"', $token] as $secret) {
            $this->assertStringNotContainsString($secret, $body, $secret);
        }
        $this->assertSame(1, LeasePaymentLink::query()->sole()->access_count);
    }

    /**
     * AC15 — inconnu 404 ; révoqué 410 ; expiré 410 ; `initiate` sur `paid` 409 ; fournisseur non
     * disponible 422. Une caution rendue, une échéance remboursée ou supprimée : 410.
     */
    public function test_unknown_gone_paid_and_unavailable_answers(): void
    {
        [$ctx, $token] = $this->linkFor();
        $links = app(LeasePaymentLinkService::class);

        $this->getJson('/api/pay/'.str_repeat('A', 43))->assertNotFound()->assertJsonPath('code', 'pay_link.not_found');
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'orange_money'])
            ->assertStatus(422)->assertJsonPath('code', 'payment.provider_not_available');

        $this->travel(71)->days();
        $this->getJson("/api/pay/{$token}")->assertStatus(410)->assertJsonPath('code', 'pay_link.gone')
            ->assertJsonPath('params.agency', $ctx['agency']->name);
        $this->travelBack();

        $links->revoke($ctx['payment']);
        $this->getJson("/api/pay/{$token}")->assertStatus(410);

        $fresh = substr($links->urlFor($ctx['payment']), strlen('https://front.test/pay/'));
        $this->assertNotSame($token, $fresh);
        $this->setRow($ctx['payment'], ['status' => PaymentStatus::Paid->value, 'paid_at' => now(), 'late_fee_paid_at' => now()]);
        $this->getJson("/api/pay/{$fresh}")->assertOk()->assertJsonPath('data.amount_due', 0)->assertJsonPath('data.providers', []);
        $this->postJson("/api/pay/{$fresh}/initiate", ['provider' => 'wave'])->assertStatus(409)->assertJsonPath('code', 'payment.not_payable');

        foreach ([
            'remboursée' => ['status' => PaymentStatus::Refunded->value],
            'caution rendue' => ['status' => PaymentStatus::Pending->value, 'payment_type' => LeasePaymentType::DepositRefund->value],
        ] as $label => $state) {
            $this->setRow($ctx['payment'], $state);
            $this->getJson("/api/pay/{$fresh}")->assertStatus(410);
            $this->postJson("/api/pay/{$fresh}/initiate", ['provider' => 'wave'])->assertStatus(410);
        }
        $this->setRow($ctx['payment'], ['status' => PaymentStatus::Pending->value, 'payment_type' => LeasePaymentType::Rent->value, 'paid_at' => null]);
        $this->getJson("/api/pay/{$fresh}")->assertOk();
        $ctx['payment']->delete();
        $this->getJson("/api/pay/{$fresh}")->assertStatus(410);
    }

    /** Pose un état sans la machine à états du modèle : c'est l'état qu'on éprouve, pas la transition. */
    private function setRow(LeasePayment $payment, array $values): void
    {
        DB::table('lease_payments')->where('id', $payment->id)->update($values);
    }

    /** AC16 — `return_url` de la requête ignorée : le pilote reçoit la page du lien. */
    public function test_initiate_ignores_any_return_url_from_the_request(): void
    {
        [, $token] = $this->linkFor();
        $spy = $this->spyDriver();

        $this->postJson("/api/pay/{$token}/initiate", [
            'provider' => 'wave',
            'return_url' => 'https://evil.example/steal',
            'cancel_url' => 'https://evil.example/steal',
        ])->assertOk()->assertJsonPath('data.checkout_url', 'https://pay.example/c/1');

        $meta = $spy->calls[0]['meta'];
        $this->assertSame("https://front.test/pay/{$token}?status=success", $meta['return_url']);
        $this->assertSame("https://front.test/pay/{$token}?status=cancelled", $meta['cancel_url']);
        $this->assertStringNotContainsString('evil', json_encode($spy->calls));
    }

    /**
     * AC17 — haché pour la recherche, chiffré pour la relecture ; `urlFor` idempotent ;
     * `regenerate` émet un neuf et l'ancien rend 410.
     */
    public function test_the_token_is_stored_hashed_and_encrypted_and_regeneration_retires_it(): void
    {
        [$ctx, $token] = $this->linkFor();
        $links = app(LeasePaymentLinkService::class);

        $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43}$/', $token);
        $row = DB::table('lease_payment_links')->sole();
        $this->assertNotSame($token, $row->token);
        $this->assertStringNotContainsString($token, json_encode($row));
        $this->assertSame(hash('sha256', $token), $row->token_hash);
        $this->assertSame(0, DB::table('lease_payment_links')->where('token_hash', $token)->count());
        $this->assertStringNotContainsString($token, json_encode(LeasePaymentLink::query()->sole()->toArray()));

        $this->assertSame("https://front.test/pay/{$token}", $links->urlFor($ctx['payment']));
        $this->assertSame("https://front.test/pay/{$token}", $links->urlFor($ctx['payment']));

        $new = $links->regenerate($ctx['payment']);
        $this->assertNotSame("https://front.test/pay/{$token}", $new);
        $this->getJson("/api/pay/{$token}")->assertStatus(410);
        $this->getJson('/api/pay/'.substr($new, strlen('https://front.test/pay/')))->assertOk();
        $this->assertSame(1, LeasePaymentLink::query()->whereNull('revoked_at')->count());
    }

    /** AC20 — la 31ᵉ lecture dans la minute, même IP : 429. */
    public function test_reading_is_throttled_per_ip(): void
    {
        [, $token] = $this->linkFor();
        for ($i = 0; $i < 30; $i++) {
            $this->getJson("/api/pay/{$token}")->assertOk();
        }
        $this->getJson("/api/pay/{$token}")->assertStatus(429);
    }

    /**
     * AC34 — le lien paie `amountDue`, deux réglages ; mêmes valeurs que `LeasePaymentResource` ;
     * une échéance `paid` dont la pénalité reste due : 0, la pénalité à part, initiation 409.
     */
    public function test_the_link_pays_amount_due_under_both_agency_settings(): void
    {
        $spy = $this->spyDriver();
        foreach ([
            'désactivé' => [null, 150000.0, false, 15_000_000],
            'activé' => [['late_fee_online_collection' => true], 157500.0, true, 15_750_000],
        ] as $label => [$settings, $due, $online, $cents]) {
            [$ctx, $token] = $this->linkFor($settings);

            $show = $this->getJson("/api/pay/{$token}")->assertOk();
            $this->assertEquals($due, $show->json('data.amount_due'), $label);
            $this->assertEquals(7500, $show->json('data.late_fee_outstanding'), $label);
            $this->assertSame($online, $show->json('data.late_fee_payable_online'), $label);

            $resource = LeasePaymentResource::make($ctx['payment']->fresh())->resolve();
            foreach (['amount_due', 'late_fee_outstanding', 'late_fee_payable_online'] as $key) {
                $this->assertEquals($resource[$key], $show->json("data.{$key}"), "{$label} · {$key}");
            }

            $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();
            $this->assertSame($cents, end($spy->calls)['amount_cents'], $label);
        }

        [$ctx, $token] = $this->linkFor(null, ['status' => PaymentStatus::Paid, 'paid_at' => now()]);
        $this->getJson("/api/pay/{$token}")->assertOk()
            ->assertJsonPath('data.amount_due', 0)
            ->assertJsonPath('data.late_fee_outstanding', 7500)
            ->assertJsonPath('data.receipt_available', true);
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertStatus(409);
    }

    /** Une fois payée, le lien ne vit plus que 30 jours : le temps de la quittance. */
    public function test_a_paid_instalment_keeps_its_link_thirty_days_only(): void
    {
        [, $token] = $this->linkFor(null, ['status' => PaymentStatus::Paid, 'paid_at' => now(), 'due_date' => now()->addDays(20)->toDateString()]);

        $this->travel(29)->days();
        $this->getJson("/api/pay/{$token}")->assertOk();
        $this->travel(2)->days();
        $this->getJson("/api/pay/{$token}")->assertStatus(410);
    }

    /**
     * ADR-0051, conséquence M-1 — une échéance initiée par son lien (Wave, intégration GLOBALE) n'est
     * pas soldée par le chemin `custom_data` de Lemon Squeezy sous autorité de la plateforme.
     */
    public function test_a_link_initiated_instalment_is_not_reachable_through_lemon_squeezy_custom_data(): void
    {
        [$ctx, $token] = $this->linkFor();
        Integration::query()->where('agency_id', $ctx['agency']->id)->delete();
        Integration::factory()->create(['agency_id' => null, 'provider' => 'wave', 'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => $this->waveSecret]]);
        Integration::factory()->create(['agency_id' => null, 'provider' => 'lemon_squeezy', 'is_active' => true]);
        $this->spyDriver();
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();

        app(PaymentGatewayService::class)->handleWebhookEvent('order_created', [
            'meta' => ['event_name' => 'order_created', 'custom_data' => ['payment_id' => $ctx['payment']->id, 'payment_type' => LeasePayment::class]],
            'data' => ['id' => 'ls_order_602', 'attributes' => ['total' => 15000000, 'currency' => 'XOF']],
        ]);

        $this->assertNotSame(PaymentStatus::Paid, $ctx['payment']->fresh()->status);
    }
}
