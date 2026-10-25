<?php

namespace Tests\Feature\Lease;

use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\LeaseRenewalService;
use App\Services\Model\LeaseService;
use App\Services\Reporting\AgingBalanceService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-2375 (P04.10, ADR-0039, amendement du 2026-10-25 sur la caution) — décision du porteur :
 * l'échéancier écrit l'échéance `deposit` à l'activation du bail. Sans elle, aucun chemin
 * n'écrivait de caution (`generateSchedule` n'écrivait que des loyers, la saisie refuse `deposit`
 * depuis TCK-1920) et la caution encaissée des rapports valait 0 pour tout bail créé dans
 * l'application.
 */
class DepositInstalmentScheduleTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function draft(array $attributes = []): Lease
    {
        $landlord = User::factory()->create();

        return Lease::factory()->create($attributes + [
            'property_id' => Property::factory()->create(['user_id' => $landlord->id])->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create()->id,
            'status' => LeaseStatus::Draft,
            'start_date' => now()->addDays(3)->toDateString(),
            'end_date' => now()->addDays(3)->addMonths(6)->toDateString(),
            'monthly_rent' => 100_000,
            'deposit_amount' => 200_000,
        ]);
    }

    /** @return Collection<int, LeasePayment> */
    private function deposits(Lease $lease)
    {
        return LeasePayment::query()->where('lease_id', $lease->id)
            ->where('payment_type', LeasePaymentType::Deposit->value)
            ->get();
    }

    public function test_l_activation_ecrit_l_echeance_de_caution(): void
    {
        $lease = $this->draft();

        app(LeaseService::class)->activate($lease);

        $deposits = $this->deposits($lease);
        $this->assertCount(1, $deposits);
        $deposit = $deposits->sole();
        $this->assertSame(200000.0, (float) $deposit->amount);
        $this->assertSame(PaymentStatus::Pending, $deposit->status);
        $this->assertSame($lease->tenant_id, $deposit->payer_id);
        $this->assertSame($lease->start_date->toDateString(), $deposit->due_date->toDateString());
        $this->assertSame('XOF', $deposit->currency->value ?? $deposit->currency);
        $this->assertGreaterThan(0, LeasePayment::query()->where('lease_id', $lease->id)
            ->where('payment_type', LeasePaymentType::Rent->value)->count(), 'Les loyers naissent comme avant.');
    }

    public function test_un_bail_sans_caution_n_a_aucune_echeance_de_caution(): void
    {
        $sans = $this->draft(['deposit_amount' => null]);
        $nulle = $this->draft(['deposit_amount' => 0]);

        app(LeaseService::class)->activate($sans);
        app(LeaseService::class)->activate($nulle);

        $this->assertCount(0, $this->deposits($sans));
        $this->assertCount(0, $this->deposits($nulle));
    }

    public function test_un_renouvellement_ne_reecrit_pas_la_caution(): void
    {
        $parent = $this->draft(['start_date' => now()->subMonths(2)->toDateString(), 'end_date' => now()->addMonths(4)->toDateString()]);
        app(LeaseService::class)->activate($parent);
        $this->assertCount(1, $this->deposits($parent));

        $child = app(LeaseRenewalService::class)->renew($parent->fresh(), ['monthly_rent' => 120_000]);

        $this->assertSame($parent->id, $child->renewed_from_lease_id);
        $this->assertSame(LeaseStatus::Active, $child->fresh()->status);
        $this->assertGreaterThan(0, LeasePayment::query()->where('lease_id', $child->id)
            ->where('payment_type', LeasePaymentType::Rent->value)->count(), 'Le renouvellement reçoit ses loyers.');
        $this->assertCount(0, $this->deposits($child), 'La caution reste celle du bail d\'origine.');
        $this->assertCount(1, $this->deposits($parent));
    }

    public function test_une_regeneration_ne_double_pas_la_caution(): void
    {
        $lease = $this->draft();
        app(LeaseService::class)->activate($lease);
        LeasePayment::query()->where('lease_id', $lease->id)
            ->where('payment_type', LeasePaymentType::Rent->value)
            ->update(['status' => PaymentStatus::Cancelled->value]);

        app(LeaseService::class)->generateSchedule($lease->fresh());

        $this->assertCount(1, $this->deposits($lease));
    }

    public function test_une_caution_deja_posee_n_est_pas_reecrite(): void
    {
        $lease = $this->draft(['status' => LeaseStatus::Active]);
        LeasePayment::factory()->paid()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'payment_type' => LeasePaymentType::Deposit,
            'amount' => 200_000,
        ]);

        app(LeaseService::class)->generateSchedule($lease);

        $this->assertCount(1, $this->deposits($lease));
    }

    public function test_l_echeance_de_caution_se_regle_par_la_saisie_et_entre_aux_rapports(): void
    {
        $lease = $this->draft();
        app(LeaseService::class)->activate($lease);
        $deposit = $this->deposits($lease)->sole();

        Sanctum::actingAs($lease->landlord);
        $this->postJson("/api/lease-payments/{$deposit->id}/mark-paid", ['payment_method' => 'cash'])->assertOk();

        $this->assertSame(PaymentStatus::Paid, $deposit->fresh()->status);
        $this->assertSame(200000.0, $lease->fresh()->collectedDeposit());

        app(LeaseService::class)->terminate($lease->fresh(), $lease->landlord);
        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 200_000])->assertSuccessful();
        $this->assertSame(0.0, $lease->fresh()->deposit_remaining);
    }

    /** La caution n'entre pas dans le plafond de douze loyers d'un bail sans fin. */
    public function test_un_bail_sans_fin_garde_ses_douze_loyers(): void
    {
        $lease = $this->draft(['end_date' => null]);

        app(LeaseService::class)->activate($lease);

        $this->assertSame(12, LeasePayment::query()->where('lease_id', $lease->id)
            ->where('payment_type', LeasePaymentType::Rent->value)->count());
        $this->assertCount(1, $this->deposits($lease));
    }

    public function test_l_echeance_de_caution_se_paie_en_ligne(): void
    {
        $ctx = $this->leaseDue(payment: ['payment_type' => LeasePaymentType::Charges]);
        $ctx['lease']->forceFill(['deposit_amount' => 90_000])->save();
        app(LeaseService::class)->generateSchedule($ctx['lease']);
        $deposit = $this->deposits($ctx['lease'])->sole();

        $spy = $this->spyDriver();
        $this->actingAs($ctx['tenant'], 'sanctum');
        $this->postJson("/api/lease-payments/{$deposit->id}/initiate", ['provider' => 'wave'])->assertOk();
        $this->assertSame(9_000_000, $spy->calls[0]['amount_cents']);
        $this->waveWebhook('spy_txn_1', 90_000)->assertOk();

        $this->assertSame(PaymentStatus::Paid, $deposit->fresh()->status);
        $this->assertSame(90000.0, $ctx['lease']->fresh()->collectedDeposit());
        $this->assertSame(90000.0, app(AgingBalanceService::class)->depositsHeld($ctx['agency'])['total']);
    }
}
