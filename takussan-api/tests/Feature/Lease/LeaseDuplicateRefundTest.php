<?php

namespace Tests\Feature\Lease;

use App\Contracts\Payments\PaymentDriverContract;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Payments\Dto\CheckoutSession;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus as DriverStatus;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Reporting\OverdueInstalment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-608 — une échéance dit ce qui a été versé et ce qui reste à rembourser.
 *
 * Décision du porteur du 2026-11-16, option (b) : aucune part versée ne s'enregistre plus sur une
 * échéance de bail (TCK-1918) ; `mark-paid` solde les `partially_paid` héritées. `refund_pending` voit
 * tout doublon non remboursé (N2, N3, N4 de verif-596 passe 9), retombe après « Doublon remboursé », et
 * la part pénalité s'annonce à part (`late_fee_refund_pending`).
 */
class LeaseDuplicateRefundTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $tenantUser;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-07-01 10:00:00');
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $landlord = User::factory()->create();
        $this->tenantUser = User::factory()->create();

        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->tenantUser->id])->id,
            'status' => LeaseStatus::Active,
            'late_fee_percent' => null,
        ]);
    }

    /** @param  array<string,mixed>|null  $metadata */
    private function due(PaymentStatus $status, float $amount, string $due, ?array $metadata = null, array $extra = []): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $this->lease->id,
            'payer_id' => $this->lease->tenant_id,
            'payment_type' => LeasePaymentType::Rent,
            'status' => $status,
            'amount' => $amount,
            'due_date' => $due,
            'paid_at' => $status === PaymentStatus::Paid ? $due : null,
            'metadata' => $metadata,
            ...$extra,
        ]);
    }

    /** @return array<string,mixed> */
    private static function duplicate(string $transactionId, ?string $kind = null, ?string $refundedAt = null): array
    {
        return array_filter([
            'transaction_id' => $transactionId,
            'amount' => 100000,
            'at' => '2026-06-20T10:00:00+00:00',
            'kind' => $kind,
            'refunded_at' => $refundedAt,
        ], fn ($v) => $v !== null);
    }

    // ── AC2 — mark-paid solde une `partially_paid` héritée ─────────────────────────────────

    public function test_mark_paid_solde_une_partially_paid_heritee_au_reste_du(): void
    {
        $due = $this->due(PaymentStatus::PartiallyPaid, 100_000, '2026-06-05', ['paid_amount' => 40_000]);

        $this->actingAsApi($this->admin)
            ->postJson("/api/lease-payments/{$due->id}/mark-paid", ['payment_method' => 'cash'])
            ->assertOk()
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.remaining_amount', 0)
            ->assertJsonPath('data.paid_amount', 100000);

        $fresh = $due->fresh();
        $this->assertSame(PaymentStatus::Paid, $fresh->status);
        $this->assertEquals(0.0, $fresh->remaining_amount);
        $this->assertEquals(100000.0, $fresh->paid_amount);
    }

    /** Un trop-versé hérité n'est pas raboté au montant : le surplus reste dit. */
    public function test_mark_paid_ne_rabote_pas_un_trop_verse_herite(): void
    {
        $due = $this->due(PaymentStatus::PartiallyPaid, 50_000, '2026-06-05', ['paid_amount' => 70_000]);

        $this->actingAsApi($this->admin)
            ->postJson("/api/lease-payments/{$due->id}/mark-paid", ['payment_method' => 'cash'])
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');

        $this->assertEquals(70000.0, $due->fresh()->paid_amount);
        $this->assertEquals(0.0, $due->fresh()->remaining_amount);
    }

    // ── AC4 — un reste dû nul n'est ni un impayé ni une relance ────────────────────────────

    public function test_une_partially_paid_entierement_versee_n_est_ni_impayee_ni_relancee(): void
    {
        $soldee = $this->due(PaymentStatus::PartiallyPaid, 50_000, '2026-06-10', ['paid_amount' => 50_000]);
        $ouverte = $this->due(PaymentStatus::PartiallyPaid, 100_000, '2026-06-12', ['paid_amount' => 40_000]);

        $owed = CollectedPayments::leaseOwed()->pluck('lease_payments.id')->all();
        $this->assertNotContains($soldee->id, $owed);
        $this->assertContains($ouverte->id, $owed);

        $relancables = SendLeasePaymentReminders::remindable()->pluck('id')->all();
        $this->assertNotContains($soldee->id, $relancables);
        $this->assertContains($ouverte->id, $relancables);

        $finance = $this->actingAsApi($this->admin)->getJson('/api/dashboard/agency')->assertOk()->json('data.finance');
        $this->assertSame(1, $finance['overdue_count']);
        $this->assertEquals(60000.0, $finance['overdue_amount']);

        // La relance notée et le retard de l'historique suivent la même règle (`OverdueInstalment`).
        $this->assertNull(OverdueInstalment::daysLate($soldee->fresh()));
        $this->assertSame(19, OverdueInstalment::daysLate($ouverte->fresh()));
        $this->postJson("/api/lease-payments/{$soldee->id}/reminders", ['channel' => 'call'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'lease_payment.not_overdue');
    }

    // ── AC5 — N2, N3, N4 : `refund_pending` vrai quel que soit le checkout vérifié ─────────

    /** N3 — intégration désactivée : `verify` n'a pas de réponse du fournisseur. */
    public function test_n3_sans_reponse_du_fournisseur_le_doublon_reste_annonce(): void
    {
        $due = $this->due(PaymentStatus::Cancelled, 100_000, '2026-06-05', [
            'gateway' => ['provider' => 'wave', 'transaction_id' => 'txn_paye'],
            'gateway_duplicate_payment' => [self::duplicate('txn_paye')],
        ], ['transaction_id' => 'txn_paye']);

        $this->actingAsApi($this->tenantUser)
            ->getJson("/api/lease-payments/{$due->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.provider_status', null)
            ->assertJsonPath('data.refund_pending', true)
            ->assertJsonPath('data.late_fee_refund_pending', false);
    }

    /** N2 — deux checkouts, le plus ancien payé ; `verify` interroge le plus récent. */
    public function test_n2_le_doublon_d_un_autre_checkout_est_annonce(): void
    {
        $due = $this->due(PaymentStatus::Cancelled, 100_000, '2026-06-05', [
            'gateway' => ['provider' => 'wave', 'transaction_id' => 'txn_recent'],
            'gateway_duplicate_payment' => [self::duplicate('txn_ancien')],
        ], ['transaction_id' => 'txn_recent']);
        $this->fournisseur('wave', DriverStatus::PENDING);

        $this->actingAsApi($this->tenantUser)
            ->getJson("/api/lease-payments/{$due->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.provider_status', DriverStatus::PENDING)
            ->assertJsonPath('data.refund_pending', true);
    }

    /** N4 — Lemon Squeezy : le doublon est inscrit sous l'id de commande, `verify` interroge le checkout. */
    public function test_n4_le_doublon_inscrit_sous_la_commande_est_annonce(): void
    {
        $due = $this->due(PaymentStatus::Cancelled, 100_000, '2026-06-05', [
            'gateway' => ['provider' => 'lemon_squeezy', 'transaction_id' => 'chk_42'],
            'gateway_duplicate_payment' => [self::duplicate('order_9001')],
        ], ['transaction_id' => 'chk_42']);
        $this->fournisseur('lemon_squeezy', DriverStatus::PENDING);

        $this->actingAsApi($this->tenantUser)
            ->getJson("/api/lease-payments/{$due->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.refund_pending', true);
    }

    /** Point 7 — la part pénalité en doublon s'annonce à part, sans faire du règlement un remboursement. */
    public function test_la_part_penalite_en_doublon_s_annonce_a_part(): void
    {
        $due = $this->due(PaymentStatus::Paid, 100_000, '2026-06-05', [
            'gateway_duplicate_payment' => [self::duplicate('txn_paye', 'late_fee')],
        ]);

        $this->actingAsApi($this->tenantUser)
            ->getJson("/api/lease-payments/{$due->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.refund_pending', false)
            ->assertJsonPath('data.late_fee_refund_pending', true);
    }

    // ── AC6 — « Doublon remboursé » éteint le drapeau, au journal ; un doublon neuf le rallume ─

    public function test_doublon_rembourse_eteint_le_drapeau_et_un_doublon_neuf_le_rallume(): void
    {
        $due = $this->due(PaymentStatus::Cancelled, 100_000, '2026-06-05', [
            'gateway_duplicate_payment' => [
                self::duplicate('txn_a'),
                self::duplicate('txn_b', 'late_fee'),
                self::duplicate('txn_c', null, '2026-06-21T10:00:00+00:00'),
            ],
        ]);

        $this->actingAsApi($this->admin)
            ->getJson("/api/leases/{$this->lease->id}/payments")
            ->assertOk()
            ->assertJsonPath('data.0.duplicate_refund_pending', true);

        $this->actingAsApi($this->admin)
            ->postJson("/api/lease-payments/{$due->id}/duplicate-refunded", ['note' => 'Remboursé par Wave'])
            ->assertOk()
            ->assertJsonPath('data.duplicate_refund_pending', false);

        $entries = $due->fresh()->metadata['gateway_duplicate_payment'];
        $this->assertNotNull($entries[0]['refunded_at'] ?? null);
        $this->assertNotNull($entries[1]['refunded_at'] ?? null);
        // Le remboursement déjà noté par le fournisseur garde sa date.
        $this->assertSame('2026-06-21T10:00:00+00:00', $entries[2]['refunded_at']);

        $journal = Activity::query()->where('log_name', 'LeasePayment')->where('event', 'duplicate_refunded')->sole();
        $this->assertSame($this->admin->id, (int) $journal->causer_id);
        $this->assertSame($due->id, (int) $journal->subject_id);
        $this->assertSame(2, $journal->properties['marked']);

        $this->actingAsApi($this->tenantUser)
            ->getJson("/api/lease-payments/{$due->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.refund_pending', false)
            ->assertJsonPath('data.late_fee_refund_pending', false);

        // Rien de plus à constater.
        $this->actingAsApi($this->admin)
            ->postJson("/api/lease-payments/{$due->id}/duplicate-refunded")
            ->assertStatus(409)
            ->assertJsonPath('code', 'lease_payment.no_duplicate_to_refund');

        // Un doublon inscrit ensuite rallume le drapeau.
        $meta = $due->fresh()->metadata;
        $meta['gateway_duplicate_payment'][] = self::duplicate('txn_d');
        $due->fresh()->forceFill(['metadata' => $meta])->saveQuietly();

        $this->actingAsApi($this->tenantUser)
            ->getJson("/api/lease-payments/{$due->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.refund_pending', true);
    }

    // ── Autorisation : de l'argent qui sort ────────────────────────────────────────────────

    public function test_un_admin_sans_second_facteur_ne_constate_pas_le_remboursement(): void
    {
        $sans2fa = User::factory()->create(['two_factor_enabled' => false, 'two_factor_secret' => null]);
        AgencyAdminProfile::factory()->create(['user_id' => $sans2fa->id, 'agency_id' => $this->agency->id]);
        $due = $this->due(PaymentStatus::Cancelled, 100_000, '2026-06-05', ['gateway_duplicate_payment' => [self::duplicate('txn_a')]]);

        $this->actingAsApi($sans2fa)
            ->postJson("/api/lease-payments/{$due->id}/duplicate-refunded")
            ->assertForbidden()
            ->assertJsonPath('code', 'two_factor_required');
        $this->assertArrayNotHasKey('refunded_at', $due->fresh()->metadata['gateway_duplicate_payment'][0]);
    }

    public function test_ni_l_agent_ni_le_locataire_ne_constatent_le_remboursement(): void
    {
        $due = $this->due(PaymentStatus::Cancelled, 100_000, '2026-06-05', ['gateway_duplicate_payment' => [self::duplicate('txn_a')]]);

        $this->actingAsApi($this->agencyAgent($this->agency))
            ->postJson("/api/lease-payments/{$due->id}/duplicate-refunded")
            ->assertForbidden();
        $this->actingAsApi($this->tenantUser)
            ->postJson("/api/lease-payments/{$due->id}/duplicate-refunded")
            ->assertForbidden();
        $this->assertArrayNotHasKey('refunded_at', $due->fresh()->metadata['gateway_duplicate_payment'][0]);
    }

    /** Le fournisseur répond `$status` à toute vérification. */
    private function fournisseur(string $provider, string $status): void
    {
        Integration::factory()->create([
            'agency_id' => $this->agency->id,
            'provider' => $provider,
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => 's', 'store_id' => '1'],
        ]);
        $driver = new class($status) implements PaymentDriverContract
        {
            public function __construct(private readonly string $status) {}

            public function initiate(Model $payment, int $amountCents, string $currency, array $meta = []): CheckoutSession
            {
                throw new \LogicException('non utilisé');
            }

            public function verify(string $externalId): DriverStatus
            {
                return new DriverStatus($this->status, $externalId, []);
            }

            public function handleWebhook(Request $request): PaymentEvent
            {
                throw new \LogicException('non utilisé');
            }
        };
        $this->partialMock(PaymentGatewayService::class, fn ($mock) => $mock->shouldReceive('driverFor')->andReturn($driver));
    }
}
