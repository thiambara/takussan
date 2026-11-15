<?php

namespace Tests\Feature\Payments;

use App\Domain\Notifications\NotificationCode;
use App\Exceptions\ApiError;
use App\Jobs\Accounting\MatchBankStatementJob;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\PlatformPayout;
use App\Models\User;
use App\Services\Accounting\ReconciliationMatcher;
use App\Services\Billing\PlatformPayoutRefundSignal;
use App\Services\Billing\PlatformPayoutService;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Payout\PayoutCalculator;
use App\Services\Payout\PayoutClawbacks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-2793 (ADR-0039, amendement du 2026-11-14) — la pénalité de retard payée SEULE en ligne
 * (TCK-2778) se retrouve, au centime, chez qui l'a reçue : au net du `PlatformPayout` quand la
 * plateforme l'a encaissée (une seule fois), au rapprochement de l'agence quand l'agence l'a
 * encaissée (une ligne à part, le loyer gardant son montant attendu), et son remboursement a les
 * effets comptables d'un remboursement de loyer, à hauteur de la pénalité.
 *
 * Chaque cas croise les encaisseurs : un cas où loyer et pénalité ont le même encaisseur passerait
 * sans le correctif.
 */
class PenaliteSeuleComptabiliteTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    private const FEE = 5_000;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Notification::fake();
        config()->set('app.frontend_url', 'https://front.test');
    }

    /**
     * Le loyer de 150 000 payé il y a 45 jours, une pénalité de 5 000 due. Le loyer a été soldé en
     * ligne par `rent_txn`, initié par `$rentIntegration` (aucune : hors plateforme).
     *
     * @return array{agency: Agency, lease: Lease, payment: LeasePayment, tenant: User, agent: User}
     */
    private function paidWithFeeDue(?Integration $rentIntegration = null): array
    {
        $paidAt = now()->subDays(45);
        $entry = ['transaction_id' => 'rent_txn', 'provider' => 'wave', 'amount' => 150000, 'late_fee_included' => false,
            'late_fee_amount' => 0.0, 'initiated_at' => $paidAt->copy()->subHour()->toIso8601String()];

        $ctx = $this->leaseDue(['late_fee_online_collection' => true], [
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
                    'provider' => 'wave', 'transaction_id' => 'rent_txn', 'settled_by' => 'rent_txn',
                    'transactions' => [$entry],
                ],
            ],
        ]);

        if ($rentIntegration !== null) {
            $meta = $ctx['payment']->metadata;
            $meta['gateway']['integration_id'] = $rentIntegration->id;
            $meta['gateway']['transactions'][0]['integration_id'] = $rentIntegration->id;
            DB::table('lease_payments')->where('id', $ctx['payment']->id)->update(['metadata' => json_encode($meta)]);
            $ctx['payment'] = $ctx['payment']->fresh();
        }

        return $ctx;
    }

    private function platformWave(): Integration
    {
        return Integration::factory()->create(['agency_id' => null, 'provider' => 'wave', 'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => $this->waveSecret]]);
    }

    /** Le lien de la pénalité seule, son checkout, et le webhook de succès reçu sur `$integration`. */
    private function payLateFeeAlone(array $ctx, Integration $integration): LeasePayment
    {
        $this->spyDriver();
        $url = $this->actingAs($ctx['agent'], 'sanctum')
            ->postJson('/api/lease-payments/'.$ctx['payment']->id.'/payment-link')->assertOk()->json('data.url');
        $token = substr($url, strlen('https://front.test/pay/'));
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', self::FEE, integration: $integration)->assertOk();

        $fresh = $ctx['payment']->fresh();
        $this->assertNotNull($fresh->late_fee_paid_at);
        $this->assertSame($integration->id, $fresh->lateFeeAloneSettlement()['integration_id']);

        return $fresh;
    }

    private function close(Agency $agency, Carbon $end): ?PlatformPayout
    {
        return app(PlatformPayoutService::class)->closePeriod($agency, $end, User::factory()->create())['created'][0] ?? null;
    }

    private function refundLateFee(Integration $integration): void
    {
        $matched = app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave', PaymentEvent::TYPE_REFUNDED, 'spy_txn_1', ['amount' => (string) self::FEE, 'currency' => 'XOF'], WebhookAuthority::of($integration),
        ));
        $this->assertSame(1, $matched);
    }

    /**
     * AC1 — une agence servie par la seule intégration globale émet le lien ; la pénalité entre au
     * net du `PlatformPayout` suivant, une seule fois ; un reversement annulé la rend éligible. Le
     * loyer, réglé hors plateforme, n'y entre pas.
     */
    public function test_ac1_la_penalite_seule_encaissee_par_la_plateforme_entre_une_fois_au_net(): void
    {
        $ctx = $this->paidWithFeeDue();
        Integration::query()->where('agency_id', $ctx['agency']->id)->delete();
        $fresh = $this->payLateFeeAlone($ctx, $this->platformWave());
        $this->assertTrue(app(PlatformPayoutService::class)->lateFeeAloneSettledByPlatform($fresh));
        DB::table('lease_payments')->where('id', $fresh->id)->update(['platform_fee_pct_at_payment' => 10]);
        $fresh = $fresh->fresh();
        // Les métriques (ADR-0057) lui comptent les frais de la clôture.
        $this->assertSame([$fresh->id => (float) self::FEE], app(PlatformPayoutService::class)->platformSettledLateFees([$fresh]));

        $payout = $this->close($ctx['agency'], now());
        $this->assertNotNull($payout);
        $this->assertSame([(float) self::FEE, 500.0, 4500.0, 1, 0],
            [(float) $payout->gross_amount, (float) $payout->platform_fee_amount, (float) $payout->net_amount,
                $payout->metadata['late_fee_alone_count'], $payout->metadata['lease_payments_count']]);
        $this->assertSame($payout->id, $fresh->fresh()->late_fee_platform_payout_id);
        $this->assertNull($fresh->fresh()->platform_payout_id, 'Le loyer, réglé hors plateforme, n\'y entre pas.');

        // Une seule fois : la clôture suivante n'a plus rien à prendre.
        $this->assertNull($this->close($ctx['agency'], now()->addDay()));

        // Annulé, le reversement rend la pénalité, qu'une nouvelle clôture reprend.
        app(PlatformPayoutService::class)->cancel($payout, User::factory()->create(), 'erreur');
        $this->assertNull($fresh->fresh()->late_fee_platform_payout_id);
        $again = $this->close($ctx['agency'], now()->addDays(2));
        $this->assertSame((float) self::FEE, (float) $again->gross_amount);
    }

    /**
     * Loyer encaissé par la PLATEFORME, pénalité seule par l'AGENCE : la clôture prend le loyer et
     * pas la pénalité, qui est chez l'agence.
     */
    public function test_loyer_par_la_plateforme_et_penalite_par_l_agence(): void
    {
        $ctx = $this->paidWithFeeDue($this->platformWave());
        $agencyWave = Integration::query()->where('agency_id', $ctx['agency']->id)->sole();
        $fresh = $this->payLateFeeAlone($ctx, $agencyWave);
        $this->assertFalse(app(PlatformPayoutService::class)->lateFeeAloneSettledByPlatform($fresh));

        $payout = $this->close($ctx['agency'], now());
        $this->assertSame([150000.0, 0.0, 0, 1],
            [(float) $payout->gross_amount, (float) $payout->metadata['late_fees_gross'], $payout->metadata['late_fee_alone_count'], $payout->metadata['lease_payments_count']]);
        $this->assertNull($fresh->fresh()->late_fee_platform_payout_id);
        $this->assertSame([$fresh->id => 0.0], app(PlatformPayoutService::class)->platformSettledLateFees([$fresh->fresh()]), 'Les métriques ne lui comptent aucun frais.');

        // Le loyer est chez la plateforme, la pénalité chez l'agence : elle se rapproche quand même.
        $statement = BankStatement::factory()->create(['agency_id' => $ctx['agency']->id, 'status' => BankStatementStatus::ReadyForReview]);
        $line = BankStatementLine::factory()->create(['bank_statement_id' => $statement->id, 'direction' => BankStatementLineDirection::Credit,
            'amount' => self::FEE, 'currency' => 'XOF', 'posted_at' => now()->toDateString()]);
        $admin = User::factory()->create(['agency_id' => $ctx['agency']->id]);
        $ctx['agency']->update(['primary_admin_id' => $admin->id]);
        $this->actingAs($admin)->postJson("/api/bank-statement-lines/{$line->id}/match", ['payment_type' => 'lease_payment_late_fee', 'payment_id' => $fresh->id])
            ->assertOk();
        $this->assertSame($line->id, $fresh->fresh()->late_fee_bank_statement_line_id);
    }

    /** Une pénalité seule de la plateforme rendue en entier avant la clôture n'est pas prise : aucun reversement à 0. */
    public function test_une_penalite_seule_rendue_avant_la_cloture_n_est_pas_prise(): void
    {
        $ctx = $this->paidWithFeeDue();
        Integration::query()->where('agency_id', $ctx['agency']->id)->delete();
        $platform = $this->platformWave();
        $this->payLateFeeAlone($ctx, $platform);
        $this->refundLateFee($platform);

        $this->assertNull($this->close($ctx['agency'], now()));
        $this->assertNull($ctx['payment']->fresh()->late_fee_platform_payout_id);
    }

    /**
     * La clôture GLOBALE voit une agence dont le seul élément est une pénalité seule de la plateforme ;
     * remboursée après la clôture, la pénalité fait refuser l'approbation (`items_changed`).
     */
    public function test_la_cloture_globale_la_prend_et_un_remboursement_bloque_l_approbation(): void
    {
        // Le loyer, encaissé par la plateforme, est déjà porté par un reversement : la pénalité seule
        // est le SEUL élément éligible de l'agence.
        $platform = $this->platformWave();
        $ctx = $this->paidWithFeeDue($platform);
        $ctx['agency']->update(['is_verified' => true]);
        $this->assertNotNull($this->close($ctx['agency'], now()->subDay()));
        Integration::query()->where('agency_id', $ctx['agency']->id)->delete();
        $this->payLateFeeAlone($ctx, $platform);

        $created = app(PlatformPayoutService::class)->closePeriod(null, now(), User::factory()->create())['created'];
        $payout = collect($created)->firstWhere('agency_id', $ctx['agency']->id);
        $this->assertNotNull($payout);
        $this->assertSame((float) self::FEE, (float) $payout->gross_amount);

        $this->refundLateFee($platform);
        try {
            app(PlatformPayoutService::class)->approve($payout, User::factory()->create());
            $this->fail('Approuvé malgré la pénalité rendue.');
        } catch (ApiError $e) {
            $this->assertSame('platform_payout.items_changed', $e->errorCode);
        }
    }

    /** La confirmation EN LOT d'une ligne proposée sur la pénalité seule la rapproche, elle, et pas le loyer. */
    public function test_la_confirmation_en_lot_rapproche_la_penalite_et_pas_le_loyer(): void
    {
        $ctx = $this->paidWithFeeDue();
        $agencyWave = Integration::query()->where('agency_id', $ctx['agency']->id)->sole();
        $payment = $this->payLateFeeAlone($ctx, $agencyWave);

        $statement = BankStatement::factory()->create(['agency_id' => $ctx['agency']->id, 'status' => BankStatementStatus::ReadyForReview]);
        $line = BankStatementLine::factory()->create(['bank_statement_id' => $statement->id, 'direction' => BankStatementLineDirection::Credit,
            'amount' => self::FEE, 'currency' => 'XOF', 'posted_at' => now()->toDateString(), 'reference' => $payment->reference_number]);
        (new MatchBankStatementJob($statement->id))->handle(app(ReconciliationMatcher::class));
        $this->assertSame([LeasePayment::PART_LATE_FEE, 95], [$line->refresh()->matched_part, (int) $line->match_confidence]);

        $admin = User::factory()->create(['agency_id' => $ctx['agency']->id]);
        $ctx['agency']->update(['primary_admin_id' => $admin->id]);
        $this->actingAs($admin)->postJson("/api/agencies/{$ctx['agency']->id}/bank-statement-lines/confirm-batch", ['line_ids' => [$line->id]])
            ->assertOk()->assertJsonPath('data.count', 1);

        $payment->refresh();
        $this->assertSame([$line->id, null], [$payment->late_fee_bank_statement_line_id, $payment->bank_statement_line_id]);
    }

    /**
     * Le loyer porté par un `PlatformPayout` déjà PAYÉ ; la pénalité seule payée ensuite par la
     * plateforme : un second reversement la prend, et le reversement au bailleur l'attend, lui, et
     * non celui du loyer (ADR-0039, amendement du 2026-11-14, point 4).
     */
    public function test_la_penalite_seule_attend_son_propre_reversement_de_la_plateforme(): void
    {
        $platform = $this->platformWave();
        $ctx = $this->paidWithFeeDue($platform);
        $rentPayout = $this->close($ctx['agency'], now());
        $rentPayout->forceFill(['status' => PlatformPayoutStatus::Paid])->save();

        Integration::query()->where('agency_id', $ctx['agency']->id)->delete();
        $fresh = $this->payLateFeeAlone($ctx, $platform);

        $feePayout = $this->close($ctx['agency'], now()->addDay());
        $this->assertSame((float) self::FEE, (float) $feePayout->gross_amount);
        $fresh = $fresh->fresh();
        $this->assertSame([$rentPayout->id, $feePayout->id], [$fresh->platform_payout_id, $fresh->late_fee_platform_payout_id]);

        $calculator = app(PayoutCalculator::class);
        $this->assertCount(0, $calculator->exceptLateFeesAwaitingPlatform(collect([$fresh]), $ctx['agency']),
            'Le reversement du loyer est payé, pas celui de la pénalité : elle attend.');

        $feePayout->forceFill(['status' => PlatformPayoutStatus::Paid])->save();
        $this->assertCount(1, $calculator->exceptLateFeesAwaitingPlatform(collect([$fresh]), $ctx['agency']));
    }

    /**
     * AC2 — la pénalité seule encaissée par l'agence se rapproche d'une ligne de relevé à son montant ;
     * le loyer, réglé le même jour hors ligne, garde son montant attendu (150 000, pas 155 000) et se
     * rapproche de sa propre ligne. Confirmer l'une ne libère pas l'autre ; lever l'une ne touche
     * pas l'autre.
     */
    public function test_ac2_la_penalite_seule_se_rapproche_a_part_et_le_loyer_garde_son_montant(): void
    {
        // Loyer et pénalité réglés le MÊME jour (TCK-833) : à midi, l'heure d'avant reste ce jour-là.
        $this->travelTo(now()->setTime(12, 0));
        $ctx = $this->leaseDue(['late_fee_online_collection' => true], [
            'status' => PaymentStatus::Paid, 'paid_at' => now()->subHour(), 'late_fee_amount' => self::FEE,
            'payment_method' => 'bank_transfer', 'metadata' => null,
        ]);
        $agencyWave = Integration::query()->where('agency_id', $ctx['agency']->id)->sole();
        $payment = $this->payLateFeeAlone($ctx, $agencyWave);

        $this->assertSame(150000.0, $payment->expectedBankAmount());
        $this->assertTrue(LeasePayment::query()->whereKey($payment->id)->whereExpectedAmountNear(150000, 0.01)->exists());
        $this->assertFalse(LeasePayment::query()->whereKey($payment->id)->whereExpectedAmountNear(155000, 0.01)->exists());

        $statement = BankStatement::factory()->create(['agency_id' => $ctx['agency']->id, 'status' => BankStatementStatus::ReadyForReview]);
        $line = fn (int $amount) => BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id, 'direction' => BankStatementLineDirection::Credit, 'amount' => $amount,
            'currency' => 'XOF', 'posted_at' => now()->toDateString(), 'reference' => null, 'counterparty' => null,
        ]);
        $feeLine = $line(self::FEE);
        $rentLine = $line(150_000);
        (new MatchBankStatementJob($statement->id))->handle(app(ReconciliationMatcher::class));

        $feeLine->refresh();
        $this->assertSame([BankStatementLineMatchStatus::Suggested, LeasePayment::class, $payment->id, LeasePayment::PART_LATE_FEE],
            [$feeLine->match_status, $feeLine->matched_payment_type, $feeLine->matched_payment_id, $feeLine->matched_part]);
        $this->assertSame([BankStatementLineMatchStatus::Suggested, $payment->id, null],
            [$rentLine->refresh()->match_status, $rentLine->matched_payment_id, $rentLine->matched_part]);

        $admin = User::factory()->create(['agency_id' => $ctx['agency']->id]);
        $ctx['agency']->update(['primary_admin_id' => $admin->id]);
        $this->assertSame([['lease_payment_late_fee', $payment->id]], array_map(
            fn ($c) => [$c['type'], $c['id']],
            $this->actingAs($admin)->getJson("/api/agencies/{$ctx['agency']->id}/bank-statements/payment-search?amount=".self::FEE.'&direction=credit')
                ->assertOk()->json('data'),
        ));

        $this->actingAs($admin)->postJson("/api/bank-statement-lines/{$feeLine->id}/match", ['payment_type' => 'lease_payment_late_fee', 'payment_id' => $payment->id])
            ->assertOk()->assertJsonPath('data.matched_payment_type', 'lease_payment_late_fee');
        $payment->refresh();
        $this->assertSame([$feeLine->id, null], [$payment->late_fee_bank_statement_line_id, $payment->bank_statement_line_id]);
        $this->assertSame(BankStatementLineMatchStatus::Suggested, $rentLine->refresh()->match_status, 'Confirmer la pénalité ne libère pas la ligne du loyer.');

        $this->actingAs($admin)->postJson("/api/bank-statement-lines/{$rentLine->id}/match", ['payment_type' => 'lease_payment', 'payment_id' => $payment->id])->assertOk();
        $this->assertSame([$feeLine->id, $rentLine->id], [$payment->refresh()->late_fee_bank_statement_line_id, $payment->bank_statement_line_id]);

        $this->actingAs($admin)->deleteJson("/api/bank-statement-lines/{$feeLine->id}/match")->assertOk();
        $this->assertSame([null, $rentLine->id], [$payment->refresh()->late_fee_bank_statement_line_id, $payment->bank_statement_line_id]);
    }

    /** La pénalité seule encaissée par la plateforme n'est jamais attendue sur le relevé de l'agence. */
    public function test_la_penalite_seule_de_la_plateforme_ne_se_rapproche_pas(): void
    {
        $ctx = $this->paidWithFeeDue();
        Integration::query()->where('agency_id', $ctx['agency']->id)->delete();
        $payment = $this->payLateFeeAlone($ctx, $this->platformWave());

        $this->assertFalse(LeasePayment::query()->lateFeeAwaitingBankCredit($ctx['agency']->id)->exists());
        $statement = BankStatement::factory()->create(['agency_id' => $ctx['agency']->id, 'status' => BankStatementStatus::ReadyForReview]);
        $line = BankStatementLine::factory()->create(['bank_statement_id' => $statement->id, 'direction' => BankStatementLineDirection::Credit,
            'amount' => self::FEE, 'currency' => 'XOF', 'posted_at' => now()->toDateString()]);
        $admin = User::factory()->create(['agency_id' => $ctx['agency']->id]);
        $ctx['agency']->update(['primary_admin_id' => $admin->id]);

        $this->actingAs($admin)->postJson("/api/bank-statement-lines/{$line->id}/match", ['payment_type' => 'lease_payment_late_fee', 'payment_id' => $payment->id])
            ->assertStatus(422)->assertJsonPath('errors.payment_id.0', __('reconciliation.validation.settled_by_platform'));
        $this->assertNull($payment->refresh()->late_fee_bank_statement_line_id);
    }

    /**
     * AC3 — encaissée par l'agence, la pénalité remboursée donne un `Payout` constaté de la pénalité,
     * et les avis de la pénalité ; le loyer garde `status` et `refund_amount`.
     */
    public function test_ac3_le_remboursement_d_une_penalite_de_l_agence_cree_un_constate(): void
    {
        // Le loyer chez la PLATEFORME : le constaté se juge sur l'encaisseur de la pénalité.
        $ctx = $this->paidWithFeeDue($this->platformWave());
        $agencyWave = Integration::query()->where('agency_id', $ctx['agency']->id)->sole();
        $this->payLateFeeAlone($ctx, $agencyWave);

        $this->refundLateFee($agencyWave);

        $fresh = $ctx['payment']->fresh();
        $this->assertSame([PaymentStatus::Paid, null, (float) self::FEE], [$fresh->status, $fresh->refund_amount, (float) $fresh->late_fee_refund_amount]);
        $observed = Payout::query()->where('refunded_payment_id', $fresh->id)->sole();
        $this->assertSame([PayoutStatus::Completed, PayeeRole::Tenant, (float) self::FEE],
            [$observed->status, $observed->payee_role, (float) $observed->net_amount]);

        $this->assertSame(1, AppNotification::query()->where('user_id', $ctx['tenant']->id)->where('code', NotificationCode::LeasePaymentLateFeeRefunded->value)->count());
        $this->assertSame(0, AppNotification::query()->where('code', NotificationCode::LeasePaymentRefunded->value)->count());
        $this->assertSame(1, AppNotification::query()->where('user_id', $ctx['lease']->landlord_id)->where('code', NotificationCode::LeasePaymentLateFeeRefundedLandlord->value)->count());
    }

    /**
     * AC3 — encaissée par la plateforme (le loyer, lui, hors plateforme), aucun constaté ; le
     * reversement de la plateforme déjà payé qui l'a prise est signalé.
     */
    public function test_ac3_le_remboursement_d_une_penalite_de_la_plateforme_ne_cree_aucun_constate(): void
    {
        $ctx = $this->paidWithFeeDue();
        Integration::query()->where('agency_id', $ctx['agency']->id)->delete();
        $platform = $this->platformWave();
        $this->payLateFeeAlone($ctx, $platform);
        $payout = $this->close($ctx['agency'], now());
        $payout->forceFill(['status' => PlatformPayoutStatus::Paid])->save();

        $this->refundLateFee($platform);

        $fresh = $ctx['payment']->fresh();
        $this->assertSame([PaymentStatus::Paid, null, (float) self::FEE], [$fresh->status, $fresh->refund_amount, (float) $fresh->late_fee_refund_amount]);
        $this->assertSame(0, Payout::query()->where('refunded_payment_id', $fresh->id)->count());
        $this->assertSame([$fresh->id], array_column(PlatformPayoutRefundSignal::of($payout->fresh()), 'payment_id'));
    }

    /**
     * AC3 — la pénalité seule déjà reversée au bailleur, puis remboursée : une reprise `late_fee`
     * prise sur la copie de la pénalité, jamais sur le pivot du loyer.
     */
    public function test_ac3_la_penalite_reversee_puis_remboursee_donne_une_reprise_de_la_penalite(): void
    {
        $ctx = $this->paidWithFeeDue();
        $agencyWave = Integration::query()->where('agency_id', $ctx['agency']->id)->sole();
        $payment = $this->payLateFeeAlone($ctx, $agencyWave);
        $landlordPayout = Payout::factory()->create(['agency_id' => $ctx['agency']->id, 'landlord_id' => $ctx['lease']->landlord_id,
            'lease_id' => $ctx['lease']->id, 'status' => PayoutStatus::Completed, 'processed_at' => now()]);
        DB::table('lease_payments')->where('id', $payment->id)->update(['late_fee_payout_id' => $landlordPayout->id,
            'late_fee_payout_amount' => self::FEE, 'late_fee_payout_commission_rate' => 10, 'late_fee_payout_commission_amount' => 500]);

        $this->refundLateFee($agencyWave);

        $clawback = DB::table(PayoutClawbacks::TABLE)->where('refunded_payment_id', $payment->id)->sole();
        $this->assertSame([PayoutClawbacks::PART_LATE_FEE, $landlordPayout->id, (float) self::FEE, 500.0, 4500.0],
            [$clawback->part, (int) $clawback->source_payout_id, (float) $clawback->refund_amount, (float) $clawback->commission_amount, (float) $clawback->amount]);
    }
}
