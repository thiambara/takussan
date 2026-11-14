<?php

namespace Tests\Feature\Payments;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\LeasePaymentReminder;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2778 — la relance NOTÉE d'une pénalité de retard restée due sur une échéance PAYÉE. Elle porte
 * `subject: late_fee`, déduit de l'échéance (jamais du corps) ; la relance d'un loyer en retard porte
 * `rent`. L'historique de l'échéance et « Dernière relance » de l'historique des paiements la rendent.
 * Une échéance sans rien de dû garde son 409.
 */
class RelancePenaliteSeuleTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-11 10:00:00', 'Africa/Dakar'));
        // L'agence n'encaisse PAS ses pénalités en ligne : la relance notée reste permise (AC3).
        $this->agency = Agency::factory()->create(['settings' => null]);
        $this->admin = $this->agencyAdmin($this->agency);
        $landlord = User::factory()->create();
        $this->lease = Lease::factory()->create([
            'property_id' => Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id])->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'status' => LeaseStatus::Active,
        ]);
    }

    private function instalment(PaymentStatus $status, array $attributes = []): LeasePayment
    {
        return LeasePayment::factory()->create(array_merge([
            'lease_id' => $this->lease->id,
            'payer_id' => $this->lease->tenant_id,
            'status' => $status,
            'amount' => 100_000,
            'due_date' => now('Africa/Dakar')->subDays(40)->toDateString(),
            'paid_at' => $status === PaymentStatus::Paid ? now()->subDays(35) : null,
            'late_fee_amount' => 5_000,
            'late_fee_applied_at' => now()->subDays(38),
            'late_fee_paid_at' => null,
        ], $attributes));
    }

    private function remind(LeasePayment $payment, array $body = ['channel' => 'whatsapp'])
    {
        return $this->actingAsApi($this->admin)->postJson("/api/lease-payments/{$payment->id}/reminders", $body);
    }

    /** AC4 (et AC3 : agence sans encaissement en ligne) — notée, `late_fee`, rendue par l'historique de l'échéance. */
    public function test_ac4_la_relance_d_une_penalite_seule_est_notee_et_listee(): void
    {
        $payment = $this->instalment(PaymentStatus::Paid);

        $this->remind($payment, ['channel' => 'call', 'note' => 'Passera à l\'agence'])->assertCreated()
            ->assertJsonPath('data.subject', 'late_fee')
            ->assertJsonPath('data.channel', 'call');

        $this->assertSame('late_fee', LeasePaymentReminder::query()->sole()->subject->value);
        $entries = $this->getJson("/api/lease-payments/{$payment->id}/reminders")->assertOk()->json('data');
        $this->assertSame([['manual', 'late_fee']], array_map(fn (array $e): array => [$e['source'], $e['subject']], $entries));
    }

    /** Le sujet se déduit de l'échéance : un corps qui le nomme n'y change rien. */
    public function test_le_sujet_ne_vient_jamais_du_corps(): void
    {
        $this->remind($this->instalment(PaymentStatus::Paid), ['channel' => 'whatsapp', 'subject' => 'rent'])
            ->assertCreated()->assertJsonPath('data.subject', 'late_fee');
        $this->remind($this->instalment(PaymentStatus::Late), ['channel' => 'whatsapp', 'subject' => 'late_fee'])
            ->assertCreated()->assertJsonPath('data.subject', 'rent');
    }

    /** AC6, côté relance — un loyer en retard, pénalité comprise, se relance comme loyer. */
    public function test_un_loyer_en_retard_avec_penalite_se_relance_comme_loyer(): void
    {
        $this->remind($this->instalment(PaymentStatus::Pending))->assertCreated()->assertJsonPath('data.subject', 'rent');
    }

    /** AC5 — payée, pénalité réglée ou nulle ; ou annulée : 409 inchangé, rien d'écrit. */
    public function test_ac5_sans_penalite_due_la_relance_reste_refusee(): void
    {
        foreach ([
            'pénalité réglée' => $this->instalment(PaymentStatus::Paid, ['late_fee_paid_at' => now()->subDay()]),
            'pénalité nulle' => $this->instalment(PaymentStatus::Paid, ['late_fee_amount' => null, 'late_fee_applied_at' => null]),
            'annulée' => $this->instalment(PaymentStatus::Cancelled),
            'remboursée' => $this->instalment(PaymentStatus::Refunded),
        ] as $label => $payment) {
            $this->remind($payment)->assertStatus(409)->assertJsonPath('code', 'lease_payment.not_overdue');
        }
        $this->assertSame(0, LeasePaymentReminder::query()->count());
    }

    /** « Dernière relance » de l'historique des paiements lit le sujet. */
    public function test_la_derniere_relance_de_l_historique_porte_le_sujet(): void
    {
        $payment = $this->instalment(PaymentStatus::Paid);
        $this->remind($payment)->assertCreated();

        $rows = collect($this->getJson('/api/payments/history?per_page=100&include=reminders')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame('late_fee', $rows[$payment->id]['last_reminder']['subject']);
        $this->assertSame(1, $rows[$payment->id]['reminders_count']);
    }
}
