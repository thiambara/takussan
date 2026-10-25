<?php

namespace Tests\Feature\Lease;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\User;
use App\Services\Lease\DepositRefundService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * TCK-2340 (P04.10) — décision du porteur : la restitution d'une caution est bornée à la caution
 * réellement encaissée (Σ des échéances `deposit` payées − déjà rendu − retenue vivante), la
 * définition qu'emploient déjà les rapports. Une restitution déjà faite au-delà de la borne n'est ni
 * réécrite ni annulée.
 */
class DepositRefundBoundedToCollectedTest extends TestCase
{
    use RefreshDatabase;

    private DepositRefundService $service;

    private User $issuer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(DepositRefundService::class);
        $this->issuer = User::factory()->create();
    }

    public function test_une_caution_jamais_encaissee_ne_se_restitue_pas(): void
    {
        $lease = $this->lease();

        $this->assertRefusal('deposit_refund.not_collected', fn () => $this->service->refund($lease, $this->issuer, ['amount' => 600000]));

        $this->assertSame(0.0, $lease->fresh()->deposit_remaining);
        $this->assertSame(0, Payout::query()->where('lease_id', $lease->id)->count());
        $this->assertSame(0, Invoice::query()->where('invoiceable_id', $lease->id)->count());
        $this->assertSame(0, LeasePayment::query()->where('lease_id', $lease->id)->count());
        $this->assertNull($lease->fresh()->deposit_refunded_amount);
    }

    public function test_une_caution_encaissee_en_partie_se_restitue_a_hauteur_de_l_encaisse(): void
    {
        $lease = $this->lease();
        $this->depositLine($lease, 300000, PaymentStatus::Paid);

        $this->assertSame(300000.0, $lease->fresh()->deposit_remaining);
        $this->assertRefusal('deposit_refund.exceeds_remaining', fn () => $this->service->refund($lease, $this->issuer, ['amount' => 300001]));

        $result = $this->service->refund($lease, $this->issuer, ['amount' => 300000]);

        $this->assertNull($result['invoice'], 'Rendre tout l’encaissé ne retient rien.');
        $this->assertSame(300000.0, (float) $result['payout']->net_amount);
        $this->assertSame(0.0, $result['lease']->deposit_remaining);
    }

    public function test_une_restitution_partielle_ne_retient_que_ce_qui_a_ete_encaisse(): void
    {
        $lease = $this->lease();
        $this->depositLine($lease, 300000, PaymentStatus::Paid);

        $result = $this->service->refund($lease, $this->issuer, ['amount' => 200000, 'reason' => 'Peinture']);

        $this->assertInstanceOf(Invoice::class, $result['invoice']);
        $this->assertSame(100000.0, (float) $result['invoice']->total_amount);
        $this->assertSame(0.0, $result['lease']->deposit_remaining);
    }

    public function test_seules_les_echeances_deposit_payees_du_bail_comptent(): void
    {
        $lease = $this->lease();
        $this->depositLine($lease, 600000, PaymentStatus::Pending);
        $this->depositLine($lease, 50000, PaymentStatus::Paid, LeasePaymentType::DepositRefund);
        $this->depositLine($this->lease(), 600000, PaymentStatus::Paid);

        $this->assertSame(0.0, $lease->fresh()->deposit_remaining);
        $this->assertRefusal('deposit_refund.not_collected', fn () => $this->service->refund($lease, $this->issuer, ['amount' => 1]));
    }

    public function test_l_encaisse_ne_rend_jamais_plus_que_la_caution_du_bail(): void
    {
        $lease = $this->lease();
        $this->depositLine($lease, 400000, PaymentStatus::Paid);
        $this->depositLine($lease, 400000, PaymentStatus::Paid);

        $this->assertSame(600000.0, $lease->fresh()->deposit_remaining);
    }

    public function test_une_restitution_deja_faite_au_dela_de_la_borne_n_est_ni_reecrite_ni_annulee(): void
    {
        $lease = $this->lease(['deposit_refunded_amount' => 500000, 'deposit_refunded_at' => now()->subMonth()]);
        $this->depositLine($lease, 300000, PaymentStatus::Paid);
        $line = $this->depositLine($lease, 500000, PaymentStatus::Paid, LeasePaymentType::DepositRefund);

        $this->assertSame(0.0, $lease->fresh()->deposit_remaining);
        $this->assertRefusal('deposit_refund.already_refunded', fn () => $this->service->refund($lease, $this->issuer, ['amount' => 1]));

        $state = $this->service->state($lease->fresh());
        $this->assertSame(500000.0, $state['deposit_refunded_amount']);
        $this->assertSame(500000.0, (float) $lease->fresh()->deposit_refunded_amount);
        $this->assertSame(PaymentStatus::Paid, $line->fresh()->status);
        $this->assertSame(500000.0, (float) $line->fresh()->amount);
        $this->assertSame(0, Payout::query()->where('lease_id', $lease->id)->count());
    }

    public function test_une_caution_encaissee_en_entier_se_restitue_comme_avant(): void
    {
        $lease = $this->lease();
        $this->depositLine($lease, 600000, PaymentStatus::Paid);

        $result = $this->service->refund($lease, $this->issuer, ['amount' => 600000]);

        $this->assertSame(600000.0, (float) $result['lease']->deposit_refunded_amount);
        $this->assertSame('full', $this->service->state($result['lease'])['state']);
    }

    /**
     * La voie manuelle de l'encaissement (TCK-681) : une échéance `deposit` en attente, réglée par
     * `mark-paid`, ouvre la restitution. ⚠ Aucun chemin de l'application n'écrit aujourd'hui cette
     * échéance (ADR-0039, amendement du 2026-10-25 bis) : le test la pose par la fabrique.
     */
    public function test_une_caution_reglee_par_mark_paid_sur_son_echeance_se_restitue(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $lease = $this->lease(['landlord_id' => $admin->id, 'agency_id' => $admin->agency_id]);
        $line = $this->depositLine($lease, 600000, PaymentStatus::Pending);
        Sanctum::actingAs($admin);

        $this->assertSame(0.0, $lease->fresh()->deposit_remaining);
        $this->postJson("/api/lease-payments/{$line->id}/mark-paid", ['payment_method' => 'cash'])->assertOk();

        $this->assertSame(600000.0, $lease->fresh()->deposit_remaining);
    }

    public function test_le_refus_http_porte_son_code_et_son_message(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $lease = $this->lease(['landlord_id' => $admin->id, 'agency_id' => $admin->agency_id]);
        Sanctum::actingAs($admin);

        $this->withHeader('Accept-Language', 'fr')
            ->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 600000])
            ->assertStatus(422)
            ->assertJsonPath('code', 'deposit_refund.not_collected')
            ->assertJsonPath('message', __('errors.deposit_refund.not_collected', [], 'fr'));
    }

    /** @param array<string, mixed> $overrides */
    private function lease(array $overrides = []): Lease
    {
        return Lease::factory()->create(array_merge([
            'landlord_id' => $this->issuer->id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 600000,
        ], $overrides));
    }

    private function depositLine(Lease $lease, float $amount, PaymentStatus $status, LeasePaymentType $type = LeasePaymentType::Deposit): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'payment_type' => $type,
            'amount' => $amount,
            'status' => $status,
            'paid_at' => $status === PaymentStatus::Paid ? now()->subMonths(6) : null,
        ]);
    }

    private function assertRefusal(string $code, callable $closure): void
    {
        try {
            $closure();
            $this->fail("Refus {$code} attendu, aucun levé.");
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame($code, $e->getMessage());
        }
    }
}
