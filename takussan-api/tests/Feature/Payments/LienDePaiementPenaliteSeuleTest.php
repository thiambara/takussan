<?php

namespace Tests\Feature\Payments;

use App\Events\Payments\LeasePaymentSettledOnline;
use App\Http\Resources\LeasePaymentResource;
use App\Models\Agency;
use App\Models\Enums\PaymentProvider;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\LeasePaymentLink;
use App\Models\User;
use App\Services\Billing\PlatformPayoutService;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus as DriverStatus;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\LeasePaymentLinkService;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-2778 — la pénalité de retard restée due sur une échéance PAYÉE : un lien de paiement pour elle
 * seule (`subject: late_fee`). Le loyer, déjà réglé en ligne ici (`rent_txn`), n'en apprend rien :
 * ni `status`, ni `paid_at`, ni `amount`, ni son règlement (`transaction_id`, `payment_method`,
 * `gateway_expected_amount`, `late_fee_included`, `gateway.settled_by`) — ce que lisent la quittance,
 * le rapprochement et les reversements.
 *
 * Le loyer a été payé il y a 45 jours : un lien de loyer y serait caduc (30 jours de quittance) ; un
 * lien de pénalité ne l'est pas.
 */
class LienDePaiementPenaliteSeuleTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    /** La pénalité des critères d'acceptation. */
    private const FEE = 5_000;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Notification::fake();
        config()->set('app.frontend_url', 'https://front.test');
    }

    /**
     * L'échéance d'AC1 : 150 000 payés en ligne il y a 45 jours par `rent_txn`, pénalité de 5 000
     * due, et une agence qui encaisse (ou non) ses pénalités en ligne.
     *
     * @return array{agency: Agency, lease: Lease, payment: LeasePayment, tenant: User, agent: User}
     */
    private function paidWithFeeDue(bool $online = true, array $payment = []): array
    {
        $paidAt = now()->subDays(45);

        return $this->leaseDue($online ? ['late_fee_online_collection' => true] : null, array_merge([
            'status' => PaymentStatus::Paid,
            'paid_at' => $paidAt,
            'due_date' => now()->subDays(50)->toDateString(),
            'late_fee_amount' => self::FEE,
            'transaction_id' => 'rent_txn',
            'payment_method' => 'wave',
            'metadata' => [
                'gateway_expected_amount' => 150000,
                'late_fee_included' => false,
                'gateway' => [
                    'provider' => 'wave',
                    'transaction_id' => 'rent_txn',
                    'settled_by' => 'rent_txn',
                    'initiated_at' => $paidAt->copy()->subHour()->toIso8601String(),
                    'checkout_url' => 'https://pay.example/rent',
                    'transactions' => [[
                        'transaction_id' => 'rent_txn', 'provider' => 'wave', 'amount' => 150000,
                        'late_fee_included' => false, 'late_fee_amount' => 0.0,
                        'initiated_at' => $paidAt->copy()->subHour()->toIso8601String(),
                    ]],
                ],
                'gateway_events' => [[
                    'provider' => 'wave', 'transaction_id' => 'rent_txn', 'type' => PaymentEvent::TYPE_PAID,
                    'received_at' => $paidAt->toIso8601String(), 'metadata' => [],
                ]],
            ],
        ], $payment));
    }

    private function issue(array $ctx, array $body = [])
    {
        return $this->actingAs($ctx['agent'], 'sanctum')
            ->postJson('/api/lease-payments/'.$ctx['payment']->id.'/payment-link', $body);
    }

    private function tokenOf(string $url): string
    {
        return substr($url, strlen('https://front.test/pay/'));
    }

    /** @return array<string, mixed> ce que le règlement du loyer a écrit, et que rien ici ne doit toucher */
    private function rentSettlement(LeasePayment $payment): array
    {
        $payment = $payment->fresh();
        $meta = $payment->metadata;

        return [
            'status' => $payment->status,
            'paid_at' => $payment->paid_at?->toIso8601String(),
            'amount' => (float) $payment->amount,
            'refund_amount' => $payment->refund_amount,
            'transaction_id' => $payment->transaction_id,
            'payment_method' => $payment->payment_method?->value,
            'gateway_expected_amount' => $meta['gateway_expected_amount'] ?? null,
            'late_fee_included' => $meta['late_fee_included'] ?? null,
            'settled_by' => $meta['gateway']['settled_by'] ?? null,
            'gateway.transaction_id' => $meta['gateway']['transaction_id'] ?? null,
            'gateway.provider' => $meta['gateway']['provider'] ?? null,
            'gateway.checkout_url' => $meta['gateway']['checkout_url'] ?? null,
        ];
    }

    /**
     * AC1 — le lien se crée (sujet `late_fee`), la page dit la pénalité, et le pilote reçoit 5 000
     * ×100 : jamais le loyer plus la pénalité. Le règlement du loyer reste tel quel.
     */
    public function test_ac1_le_lien_ne_fait_payer_que_la_penalite(): void
    {
        $ctx = $this->paidWithFeeDue();
        $before = $this->rentSettlement($ctx['payment']);
        $spy = $this->spyDriver();

        $url = $this->issue($ctx)->assertOk()->assertJsonPath('data.subject', 'late_fee')->json('data.url');
        $this->assertSame('late_fee', LeasePaymentLink::query()->sole()->subject->value);
        $token = $this->tokenOf($url);

        $this->getJson("/api/pay/{$token}")->assertOk()
            ->assertJsonPath('data.subject', 'late_fee')
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.amount_due', self::FEE)
            ->assertJsonPath('data.late_fee_payable_online', true)
            ->assertJsonPath('data.providers', ['wave']);

        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk()
            ->assertJsonPath('data.checkout_url', 'https://pay.example/c/1');

        $this->assertCount(1, $spy->calls);
        $this->assertSame(self::FEE * 100, $spy->calls[0]['amount_cents']);
        $this->assertSame($before, $this->rentSettlement($ctx['payment']));

        $gateway = $ctx['payment']->fresh()->metadata['gateway'];
        $this->assertSame('spy_txn_1', $gateway['late_fee_checkout']['transaction_id']);
        $this->assertArrayNotHasKey('initiating', $gateway);
        $entry = collect($gateway['transactions'])->firstWhere('transaction_id', 'spy_txn_1');
        $this->assertSame(['late_fee', (float) self::FEE], [$entry['subject'], (float) $entry['amount']]);

        // Le même lien, rouvert pendant que le checkout vit : le même checkout, pas un second.
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk()
            ->assertJsonPath('data.checkout_url', 'https://pay.example/c/1');
        $this->assertCount(1, $spy->calls);
    }

    /**
     * AC2 — le webhook de succès pose `late_fee_paid_at`, et rien d'autre : le loyer garde son état,
     * sa date, son montant et son règlement ; aucune seconde quittance, aucun doublon. Rejoué, il ne
     * compte pas deux fois.
     */
    public function test_ac2_le_webhook_pose_la_penalite_reglee_et_ne_touche_pas_au_loyer(): void
    {
        Event::fake([LeasePaymentSettledOnline::class]);
        $ctx = $this->paidWithFeeDue();
        $before = $this->rentSettlement($ctx['payment']);
        $this->spyDriver();
        $token = $this->tokenOf($this->issue($ctx)->json('data.url'));
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();

        $this->waveWebhook('spy_txn_1', self::FEE)->assertOk();
        $this->waveWebhook('spy_txn_1', self::FEE)->assertOk();

        $fresh = $ctx['payment']->fresh();
        $this->assertNotNull($fresh->late_fee_paid_at);
        $this->assertSame(0.0, $fresh->lateFeeOutstanding());
        $this->assertSame($before, $this->rentSettlement($ctx['payment']));
        $this->assertSame('spy_txn_1', $fresh->metadata['gateway']['late_fee_settled_by']);
        $this->assertSame('wave', $fresh->metadata['late_fee_payment_method']);
        $this->assertArrayNotHasKey('gateway_duplicate_payment', $fresh->metadata);
        $this->assertSame(1, LeasePayment::query()->where('lease_id', $ctx['lease']->id)->count());
        Event::assertNotDispatched(LeasePaymentSettledOnline::class);

        // AC7, par le webhook : la page ne propose plus rien à payer, sans tomber en 410.
        $this->getJson("/api/pay/{$token}")->assertOk()
            ->assertJsonPath('data.amount_due', 0)
            ->assertJsonPath('data.providers', []);
    }

    /**
     * Le paiement vérifié (TCK-2650, décision 6a) décrit toujours le checkout du LOYER : la part de
     * pénalité d'un checkout de la pénalité seule n'y entre pas, même par le repli sur la dernière
     * entrée de l'historique (une ligne dont `transaction_id` ne désigne aucune entrée).
     */
    public function test_le_paiement_verifie_decrit_le_checkout_du_loyer(): void
    {
        $ctx = $this->paidWithFeeDue();
        $this->spyDriver();
        $token = $this->tokenOf($this->issue($ctx)->json('data.url'));
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', self::FEE)->assertOk();
        DB::table('lease_payments')->where('id', $ctx['payment']->id)->update(['transaction_id' => null]);

        $this->actingAs($ctx['tenant'], 'sanctum')->getJson("/api/lease-payments/{$ctx['payment']->id}/verify")->assertOk()
            ->assertJsonPath('data.payment.checkout_amount', 150000)
            ->assertJsonPath('data.payment.checkout_late_fee_amount', 0);
    }

    /** Un webhook qui rapporte moins que la pénalité figée ne la règle pas. */
    public function test_un_paiement_inferieur_a_la_penalite_ne_la_regle_pas(): void
    {
        $ctx = $this->paidWithFeeDue();
        $this->spyDriver();
        $token = $this->tokenOf($this->issue($ctx)->json('data.url'));
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();

        $this->waveWebhook('spy_txn_1', self::FEE - 1_000);

        $this->assertNull($ctx['payment']->fresh()->late_fee_paid_at);
    }

    /**
     * La vérification au retour du fournisseur interroge le checkout de la PÉNALITÉ, pas celui du
     * loyer, et la règle de même.
     */
    public function test_la_verification_du_lien_interroge_le_checkout_de_la_penalite(): void
    {
        $ctx = $this->paidWithFeeDue();
        $before = $this->rentSettlement($ctx['payment']);
        $spy = $this->spyDriver();
        $spy->verifyStatus = DriverStatus::SUCCESS;
        $token = $this->tokenOf($this->issue($ctx)->json('data.url'));
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();

        $this->postJson("/api/pay/{$token}/verify")->assertOk()
            ->assertJsonPath('data.subject', 'late_fee')
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.amount_due', 0);

        $fresh = $ctx['payment']->fresh();
        $this->assertNotNull($fresh->late_fee_paid_at);
        $this->assertSame('spy_txn_1', $fresh->metadata['gateway']['late_fee_settled_by']);
        $this->assertSame($before, $this->rentSettlement($ctx['payment']));
    }

    /**
     * Le remboursement du checkout de la pénalité s'impute à la pénalité : le loyer reste `paid`,
     * sans `refund_amount`.
     */
    public function test_le_remboursement_de_la_penalite_ne_rembourse_pas_le_loyer(): void
    {
        $ctx = $this->paidWithFeeDue();
        $before = $this->rentSettlement($ctx['payment']);
        $this->spyDriver();
        $token = $this->tokenOf($this->issue($ctx)->json('data.url'));
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', self::FEE)->assertOk();

        $integration = Integration::query()->where('provider', 'wave')->where('is_active', true)->latest('id')->firstOrFail();
        $matched = app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave', PaymentEvent::TYPE_REFUNDED, 'spy_txn_1', ['amount' => (string) self::FEE, 'currency' => 'XOF'], WebhookAuthority::of($integration),
        ));

        $this->assertSame(1, $matched);
        $fresh = $ctx['payment']->fresh();
        $this->assertSame($before, $this->rentSettlement($ctx['payment']));
        $this->assertSame((float) self::FEE, (float) $fresh->late_fee_refund_amount);
        $this->assertNotNull($fresh->late_fee_paid_at, 'Une pénalité rendue est remise (P206.04, point 7).');
    }

    /**
     * La pénalité marquée réglée à l'agence pendant qu'un checkout de pénalité est ouvert : refusée,
     * sauf passage outre ; payé quand même, le checkout est un double encaissement `kind: late_fee`.
     */
    public function test_la_penalite_reglee_a_l_agence_fait_du_checkout_paye_un_doublon(): void
    {
        $ctx = $this->paidWithFeeDue();
        $before = $this->rentSettlement($ctx['payment']);
        $this->spyDriver();
        $token = $this->tokenOf($this->issue($ctx)->json('data.url'));
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();
        $markPaid = '/api/lease-payments/'.$ctx['payment']->id.'/late-fee/mark-paid';

        $this->actingAs($ctx['agent'], 'sanctum')->postJson($markPaid)
            ->assertStatus(409)->assertJsonPath('code', 'payment.checkout_in_progress');
        $this->actingAs($ctx['agent'], 'sanctum')
            ->postJson($markPaid, ['override_open_checkout' => true, 'override_reason' => 'Réglée au guichet'])->assertOk();

        $this->waveWebhook('spy_txn_1', self::FEE)->assertOk();

        $meta = $ctx['payment']->fresh()->metadata;
        $this->assertSame([['spy_txn_1', 'late_fee', (float) self::FEE]], array_map(
            fn (array $d): array => [$d['transaction_id'], $d['kind'], (float) $d['amount']],
            $meta['gateway_duplicate_payment'],
        ));
        $this->assertArrayNotHasKey('late_fee_settled_by', $meta['gateway']);
        $this->assertSame($before, $this->rentSettlement($ctx['payment']));
    }

    /**
     * AC3 — une agence qui n'encaisse pas ses pénalités en ligne : 409 dédié, et la page d'un lien
     * de pénalité ne proposerait aucun fournisseur.
     */
    public function test_ac3_une_agence_sans_encaissement_en_ligne_ne_cree_pas_de_lien(): void
    {
        $ctx = $this->paidWithFeeDue(online: false);

        $this->issue($ctx)->assertStatus(409)->assertJsonPath('code', 'payment.late_fee_not_collected_online');
        $this->assertSame(0, LeasePaymentLink::query()->count());
    }

    /**
     * Décision 1a (2026-11-13) — la pénalité seule ne s'encaisse que sur une intégration DE
     * L'AGENCE. Sans elle (le repli global seul), le lien est refusé comme pour une agence hors
     * ligne ; un fournisseur servi par la plateforme seule n'est ni proposé ni accepté.
     */
    public function test_la_penalite_seule_ne_s_encaisse_que_par_une_integration_de_l_agence(): void
    {
        $global = fn (string $provider, array $credentials) => Integration::factory()->create([
            'agency_id' => null, 'provider' => $provider, 'is_active' => true, 'credentials' => $credentials,
        ]);

        $ctx = $this->paidWithFeeDue();
        Integration::query()->where('agency_id', $ctx['agency']->id)->delete();
        $global('wave', ['api_key' => 'k', 'webhook_secret' => $this->waveSecret]);

        $this->issue($ctx)->assertStatus(409)->assertJsonPath('code', 'payment.late_fee_not_collected_online');
        $this->assertFalse(LeasePaymentResource::make($ctx['payment']->fresh())->resolve()['late_fee_link_allowed']);

        $ctx = $this->paidWithFeeDue();
        $global('orange_money', ['client_id' => 'c', 'client_secret' => 's', 'merchant_key' => 'm', 'webhook_secret' => 'w']);
        // Témoin : la plateforme sert bien Orange Money à cette agence — le refus vient de la règle 1a.
        $this->assertContains(PaymentProvider::OrangeMoney, app(PaymentGatewayService::class)->availableProviders($ctx['payment']->fresh()));
        $token = $this->tokenOf($this->issue($ctx)->assertOk()->json('data.url'));
        $this->getJson("/api/pay/{$token}")->assertOk()->assertJsonPath('data.providers', ['wave']);
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'orange_money'])
            ->assertStatus(422)->assertJsonPath('code', 'payment.provider_not_available');
    }

    /**
     * Les lecteurs du RÈGLEMENT DU LOYER ignorent le checkout de la pénalité seule : `isSettledBy`
     * (malgré son `paid` journalisé), le montant attendu en banque (`expectedBankAmount`, et sa
     * forme SQL), et l'encaisseur du loyer (`whereNotSettledByPlatform`, `isSettledByPlatform`) — ici
     * un loyer encaissé par la PLATEFORME, et une pénalité par l'agence.
     */
    public function test_les_lecteurs_du_reglement_du_loyer_ignorent_le_checkout_de_la_penalite(): void
    {
        $ctx = $this->paidWithFeeDue();
        $agencyWave = Integration::query()->where('agency_id', $ctx['agency']->id)->sole();
        $platformWave = Integration::factory()->create(['agency_id' => null, 'provider' => 'wave', 'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => $this->waveSecret]]);
        $meta = $ctx['payment']->metadata;
        $meta['gateway']['integration_id'] = $platformWave->id;
        $meta['gateway']['transactions'][0]['integration_id'] = $platformWave->id;
        DB::table('lease_payments')->where('id', $ctx['payment']->id)->update(['metadata' => json_encode($meta)]);

        $this->spyDriver();
        $token = $this->tokenOf($this->issue($ctx)->json('data.url'));
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', self::FEE, integration: $agencyWave)->assertOk();

        $fresh = $ctx['payment']->fresh();
        $this->assertNotNull($fresh->late_fee_paid_at);

        $isSettledBy = new \ReflectionMethod(PaymentGatewayService::class, 'isSettledBy');
        $gateway = app(PaymentGatewayService::class);
        $this->assertFalse($isSettledBy->invoke($gateway, $fresh->metadata, 'spy_txn_1'));
        $this->assertTrue($isSettledBy->invoke($gateway, $fresh->metadata, 'rent_txn'));

        $this->assertSame(150000.0, $fresh->expectedBankAmount());
        $this->assertTrue(LeasePayment::query()->whereKey($fresh->id)->whereExpectedAmountNear(150000, 1)->exists());
        $this->assertFalse(LeasePayment::query()->whereKey($fresh->id)->whereExpectedAmountNear(self::FEE, 1)->exists());

        $this->assertTrue(app(PlatformPayoutService::class)->isSettledByPlatform($fresh));
        $this->assertFalse(LeasePayment::query()->whereKey($fresh->id)->whereNotSettledByPlatform()->exists());
    }

    /** AC5 — rien de dû : 409 `payment.not_payable`, pénalité réglée ou nulle. */
    public function test_ac5_sans_penalite_due_le_lien_reste_refuse(): void
    {
        foreach ([
            'réglée' => ['late_fee_paid_at' => now()->subDay()],
            'nulle' => ['late_fee_amount' => null, 'late_fee_applied_at' => null],
        ] as $label => $state) {
            $ctx = $this->paidWithFeeDue(payment: $state);
            $this->issue($ctx)->assertStatus(409)->assertJsonPath('code', 'payment.not_payable');
        }
        $this->assertSame(0, LeasePaymentLink::query()->count());
    }

    /**
     * AC6 — une échéance due (`late`) avec pénalité garde son lien de LOYER, pénalité comprise : le
     * pilote reçoit 155 000 ×100.
     */
    public function test_ac6_une_echeance_due_garde_son_lien_de_loyer_penalite_comprise(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => true], ['late_fee_amount' => self::FEE]);
        $spy = $this->spyDriver();

        $url = $this->issue($ctx)->assertOk()->assertJsonPath('data.subject', 'rent')->json('data.url');
        $token = $this->tokenOf($url);
        $this->getJson("/api/pay/{$token}")->assertOk()
            ->assertJsonPath('data.subject', 'rent')
            ->assertJsonPath('data.amount_due', 155000);
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();

        $this->assertSame(15_500_000, $spy->calls[0]['amount_cents']);
        $this->assertSame('rent', LeasePaymentLink::query()->sole()->subject->value);
    }

    /**
     * AC7 — « Marquer la pénalité réglée » rend caduc un lien de pénalité ouvert : la page ne
     * propose plus de payer, et l'initiation est refusée.
     */
    public function test_ac7_la_penalite_marquee_reglee_rend_le_lien_caduc(): void
    {
        $ctx = $this->paidWithFeeDue();
        $token = $this->tokenOf($this->issue($ctx)->json('data.url'));

        $this->actingAs($ctx['agent'], 'sanctum')
            ->postJson('/api/lease-payments/'.$ctx['payment']->id.'/late-fee/mark-paid')->assertOk();

        $this->getJson("/api/pay/{$token}")->assertOk()
            ->assertJsonPath('data.subject', 'late_fee')
            ->assertJsonPath('data.amount_due', 0)
            ->assertJsonPath('data.providers', []);
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])
            ->assertStatus(409)->assertJsonPath('code', 'payment.not_payable');
    }

    /**
     * Idempotent : le même lien de pénalité à chaque demande. Le lien du LOYER émis pendant le retard
     * n'est jamais réaffecté : payé depuis, il est révoqué et remplacé par un lien de pénalité.
     */
    public function test_le_lien_de_penalite_est_idempotent_et_ne_reprend_pas_celui_du_loyer(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => true], ['late_fee_amount' => self::FEE]);
        $rentUrl = $this->issue($ctx)->assertJsonPath('data.subject', 'rent')->json('data.url');

        DB::table('lease_payments')->where('id', $ctx['payment']->id)
            ->update(['status' => PaymentStatus::Paid->value, 'paid_at' => now()]);

        $feeUrl = $this->issue($ctx)->assertOk()->assertJsonPath('data.subject', 'late_fee')->json('data.url');
        $this->assertNotSame($rentUrl, $feeUrl);
        $this->assertSame($feeUrl, $this->issue($ctx)->assertOk()->json('data.url'));
        $this->assertSame(1, LeasePaymentLink::query()->whereNull('revoked_at')->count());
        $this->getJson('/api/pay/'.$this->tokenOf($rentUrl))->assertStatus(410);
        $this->getJson('/api/pay/'.$this->tokenOf($feeUrl))->assertOk()->assertJsonPath('data.amount_due', self::FEE);
    }

    /**
     * La quittance d'une échéance payée et la relance automatique demandent le lien sans sujet :
     * c'est le lien du LOYER, comme avant le ticket — jamais un lien de pénalité.
     */
    public function test_un_lien_demande_sans_sujet_reste_celui_du_loyer(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => true], [
            'status' => PaymentStatus::Paid, 'paid_at' => now(), 'late_fee_amount' => self::FEE,
        ]);

        app(LeasePaymentLinkService::class)->urlFor($ctx['payment']);

        $this->assertSame('rent', LeasePaymentLink::query()->sole()->subject->value);
    }

    /** Les verdicts de la ressource, pour le front : relance et lien de la pénalité seule. */
    public function test_la_ressource_rend_les_verdicts_de_la_penalite_seule(): void
    {
        foreach ([
            'payée, pénalité due, en ligne' => [$this->paidWithFeeDue()['payment'], true, true],
            'payée, pénalité due, hors ligne' => [$this->paidWithFeeDue(online: false)['payment'], true, false],
            'payée, pénalité réglée' => [$this->paidWithFeeDue(payment: ['late_fee_paid_at' => now()])['payment'], false, false],
            'en retard' => [$this->leaseDue(['late_fee_online_collection' => true])['payment'], false, false],
        ] as $label => [$payment, $reminder, $link]) {
            $row = LeasePaymentResource::make($payment->fresh())->resolve();
            $this->assertSame([$reminder, $link], [$row['late_fee_reminder_allowed'], $row['late_fee_link_allowed']], $label);
        }
    }
}
