<?php

namespace Tests\Feature\Payments;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Model\LeaseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2649 (ADR-0100) — `GET /api/me/rent-summary` : un seul montant dû, pénalités et charges
 * comprises, ses deux parts (en ligne, à l'agence), l'état de l'échéancier et le prochain loyer.
 *
 * Avant : la page additionnait l'historique elle-même, une pénalité due sur un loyer payé n'entrait
 * dans aucun dû, et « aucune échéance émise » se lisait « vous êtes à jour ».
 */
class TenantRentSummaryTest extends TestCase
{
    use RefreshDatabase;

    private User $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Carbon::setTestNow('2026-11-11 10:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Une agence, avec ou sans encaissement des pénalités en ligne, et une intégration Wave active. */
    private function agency(bool $lateFeesOnline = false, bool $provider = true): Agency
    {
        $agency = Agency::factory()->create([
            'currency' => Currency::XOF,
            'phone' => '+221338000000',
            'settings' => ['late_fee_online_collection' => $lateFeesOnline, 'offline_payment_wave_number' => '+221770000001'],
        ]);
        if ($provider) {
            Integration::factory()->create([
                'agency_id' => $agency->id,
                'provider' => 'wave',
                'is_active' => true,
                'credentials' => ['api_key' => 'wave_key', 'webhook_secret' => 'wave_secret'],
            ]);
        }

        return $agency;
    }

    /** @param  array<string, mixed>  $attributes */
    private function lease(Agency $agency, array $attributes = []): Lease
    {
        $this->tenant ??= User::factory()->create();
        $landlord = User::factory()->create();

        return Lease::factory()->create($attributes + [
            'agency_id' => $agency->id,
            'property_id' => Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id])->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $this->tenant->id, 'agency_id' => $agency->id])->id,
            'status' => LeaseStatus::Active,
            'currency' => Currency::XOF,
            'monthly_rent' => 1_355_000,
            'monthly_charges' => null,
            'deposit_amount' => null,
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 0,
            'payment_frequency' => PaymentFrequency::Monthly,
            'payment_day' => 1,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    private function due(Lease $lease, array $attributes): LeasePayment
    {
        return LeasePayment::factory()->create($attributes + [
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'payment_type' => LeasePaymentType::Rent->value,
            'currency' => Currency::XOF,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
            'late_fee_paid_at' => null,
        ]);
    }

    /** @return array<string, mixed> */
    private function summary(): array
    {
        Sanctum::actingAs($this->tenant);

        return $this->getJson('/api/me/rent-summary')->assertOk()->json('data');
    }

    /**
     * AC1 — `locataire-f4` : loyers payés, deux pénalités de 67 750 F dues, l'agence n'encaisse pas
     * les pénalités en ligne. Avant, ce total n'existait nulle part et la page disait « à jour ».
     */
    public function test_ac1_des_penalites_dues_sur_des_loyers_payes_font_le_total_a_regler_a_l_agence(): void
    {
        $lease = $this->lease($this->agency(lateFeesOnline: false));
        foreach (['2026-07-01', '2026-10-01'] as $date) {
            $this->due($lease, [
                'amount' => 1_355_000, 'status' => PaymentStatus::Paid, 'paid_at' => $date, 'due_date' => $date,
                'period_start' => $date, 'late_fee_amount' => 67_750, 'late_fee_applied_at' => $date,
            ]);
        }
        $this->due($lease, ['amount' => 1_355_000, 'status' => PaymentStatus::Pending, 'due_date' => '2026-12-01', 'period_start' => '2026-12-01']);

        $data = $this->summary();

        $this->assertEquals(135500, $data['total_due']);
        $this->assertEquals(135500, $data['parts']['payable_at_agency']);
        $this->assertEquals(0, $data['parts']['payable_online']);
        $this->assertSame('due', $data['schedule_state']);
        $this->assertSame(['late_fee', 'late_fee'], array_column($data['items'], 'kind'));
        $this->assertSame([false, false], array_column($data['items'], 'payable_online'));
        $this->assertSame('2026-12-01', $data['next_rent']['due_date']);
        $this->assertSame(['wave_number' => '+221770000001', 'agency_phone' => '+221338000000'], $data['offline_payment']);
    }

    /** L'agence encaisse les pénalités en ligne : le loyer en retard ET sa pénalité vont en ligne. */
    public function test_une_agence_qui_encaisse_les_penalites_en_ligne_les_met_dans_la_part_en_ligne(): void
    {
        $lease = $this->lease($this->agency(lateFeesOnline: true));
        $this->due($lease, [
            'amount' => 150_000, 'status' => PaymentStatus::Late, 'due_date' => '2026-11-01', 'period_start' => '2026-11-01',
            'late_fee_amount' => 7_500, 'late_fee_applied_at' => '2026-11-05',
        ]);

        $data = $this->summary();

        $this->assertEquals(157500, $data['total_due']);
        $this->assertEquals(157500, $data['parts']['payable_online']);
        $this->assertEquals(0, $data['parts']['payable_at_agency']);
        $this->assertSame([['rent', true], ['late_fee', true]], array_map(fn ($i) => [$i['kind'], $i['payable_online']], $data['items']));
        $this->assertSame(10, $data['items'][0]['days_late']);
    }

    /** Sans fournisseur actif, rien ne se paie en ligne : tout va à l'agence, sans rien perdre. */
    public function test_sans_fournisseur_actif_tout_se_regle_a_l_agence(): void
    {
        $lease = $this->lease($this->agency(lateFeesOnline: true, provider: false));
        $this->due($lease, ['amount' => 150_000, 'status' => PaymentStatus::Pending, 'due_date' => '2026-11-01', 'period_start' => '2026-11-01']);

        $data = $this->summary();

        $this->assertEquals(150000, $data['total_due']);
        $this->assertEquals(0, $data['parts']['payable_online']);
        $this->assertEquals(150000, $data['parts']['payable_at_agency']);
    }

    /** AC2 — `locataire-vrai` : bail actif à 500 000 F sans aucune échéance → `none`, jamais `up_to_date`. */
    public function test_ac2_un_bail_actif_sans_echeance_rend_none_et_non_a_jour(): void
    {
        $lease = $this->lease($this->agency(), ['monthly_rent' => 500_000]);

        $data = $this->summary();

        $this->assertSame('none', $data['schedule_state']);
        $this->assertEquals(0, $data['total_due']);
        $this->assertNull($data['next_rent']);
        $this->assertSame($lease->reference_number, $data['lease']['reference_number']);
        $this->assertEquals(500000, $data['lease']['monthly_rent']);

        // Une caution seule n'est pas un échéancier (TCK-957).
        $this->due($lease, ['payment_type' => LeasePaymentType::Deposit->value, 'amount' => 1_000_000, 'status' => PaymentStatus::Paid, 'due_date' => '2026-10-01']);
        $this->assertSame('none', $this->summary()['schedule_state']);
    }

    /** Tout payé, un loyer à venir : `up_to_date`, avec le prochain loyer. */
    public function test_tout_paye_rend_a_jour_avec_le_prochain_loyer(): void
    {
        $lease = $this->lease($this->agency());
        $this->due($lease, ['amount' => 500_000, 'status' => PaymentStatus::Paid, 'paid_at' => '2026-11-01', 'due_date' => '2026-11-01', 'period_start' => '2026-11-01']);
        $next = $this->due($lease, ['amount' => 500_000, 'status' => PaymentStatus::Pending, 'due_date' => '2026-12-01', 'period_start' => '2026-12-01']);

        $data = $this->summary();

        $this->assertSame('up_to_date', $data['schedule_state']);
        $this->assertEquals(0, $data['total_due']);
        $this->assertSame([], $data['items']);
        $this->assertSame(['lease_id' => $lease->id, 'lease_payment_id' => $next->id, 'due_date' => '2026-12-01'], array_intersect_key($data['next_rent'], array_flip(['lease_id', 'lease_payment_id', 'due_date'])));
        $this->assertEquals(500000, $data['next_rent']['amount']);
        $this->assertTrue($data['next_rent']['payable_online']);
    }

    /** Les deux parts somment le total au centime, sur un mélange des trois cas. */
    public function test_les_deux_parts_somment_le_total(): void
    {
        $lease = $this->lease($this->agency(lateFeesOnline: false));
        $this->due($lease, ['amount' => 1_355_000, 'status' => PaymentStatus::Paid, 'paid_at' => '2026-10-01', 'due_date' => '2026-10-01', 'late_fee_amount' => 67_750, 'late_fee_applied_at' => '2026-10-05']);
        $this->due($lease, ['amount' => 1_355_000, 'status' => PaymentStatus::Late, 'due_date' => '2026-11-01', 'late_fee_amount' => 67_750, 'late_fee_applied_at' => '2026-11-05']);

        $data = $this->summary();

        $this->assertEquals(1_355_000 + 67_750 * 2, $data['total_due']);
        $this->assertEquals(1_355_000, $data['parts']['payable_online']);
        $this->assertEquals($data['total_due'], $data['parts']['payable_online'] + $data['parts']['payable_at_agency']);
        $this->assertEquals($data['total_due'], array_sum(array_column($data['items'], 'amount')));
    }

    /**
     * AC3 — parité : `payable_online` égale la somme des `amount_due` que l'historique rend pour les
     * mêmes lignes. Rougit si l'un des deux change seul.
     */
    public function test_ac3_la_part_en_ligne_egale_les_montants_dus_de_l_historique(): void
    {
        $lease = $this->lease($this->agency(lateFeesOnline: true));
        $this->due($lease, ['amount' => 150_000, 'status' => PaymentStatus::Late, 'due_date' => '2026-10-01', 'late_fee_amount' => 7_500, 'late_fee_applied_at' => '2026-10-05']);
        $this->due($lease, ['amount' => 150_000, 'status' => PaymentStatus::Pending, 'due_date' => '2026-11-01', 'metadata' => ['paid_amount' => 50_000]]);
        $this->due($lease, ['payment_type' => LeasePaymentType::Charges->value, 'amount' => 20_000, 'status' => PaymentStatus::Pending, 'due_date' => '2026-11-01']);

        $data = $this->summary();
        $ids = array_column(array_filter($data['items'], fn ($i) => $i['kind'] !== 'late_fee' && $i['payable_online']), 'lease_payment_id');
        $this->assertCount(3, $ids);

        $history = collect($this->getJson('/api/payments/history?per_page=100')->assertOk()->json('data'))
            ->where('source', 'lease')->whereIn('id', $ids);
        $this->assertCount(3, $history);
        $this->assertEquals($history->sum('amount_due'), $data['parts']['payable_online']);
        $this->assertEquals(157500 + 100000 + 20000, $data['parts']['payable_online']);
    }

    /**
     * TCK-2679 AC5 — le locataire du bail à 500 000 F + 150 000 F de charges (caution 1 000 000 F),
     * sans rien payer après la première échéance échue, doit 650 000 F : loyer et charges, ni la
     * caution ni les échéances à venir.
     */
    public function test_tck_2679_ac5_les_charges_echues_entrent_dans_le_total(): void
    {
        $lease = $this->lease($this->agency(), [
            'status' => LeaseStatus::Active, 'start_date' => '2026-11-01', 'end_date' => '2027-10-31',
            'monthly_rent' => 500_000, 'monthly_charges' => 150_000, 'deposit_amount' => 1_000_000,
        ]);
        app(LeaseService::class)->generateSchedule($lease);
        $this->assertSame(1, LeasePayment::query()->where('lease_id', $lease->id)->where('payment_type', LeasePaymentType::Deposit->value)->count());

        $data = $this->summary();

        $this->assertEquals(650000, $data['total_due']);
        $this->assertSame(['rent', 'charges'], array_column($data['items'], 'kind'));
        $this->assertSame('2026-12-01', $data['next_rent']['due_date']);
        $this->assertEquals(500000, $data['next_rent']['amount']);
        $this->assertEquals(150000, $data['next_rent']['charges_amount']);
    }

    /** Un compte, deux fiches client (deux agences) : les deux baux comptent. */
    public function test_les_fiches_du_compte_dans_deux_agences_s_additionnent(): void
    {
        $this->due($this->lease($this->agency()), ['amount' => 100_000, 'status' => PaymentStatus::Pending, 'due_date' => '2026-11-01']);
        $this->due($this->lease($this->agency()), ['amount' => 200_000, 'status' => PaymentStatus::Pending, 'due_date' => '2026-11-05']);

        $this->assertEquals(300000, $this->summary()['total_due']);
    }

    /** Le bail d'un autre locataire n'entre pas dans le total de l'appelant. */
    public function test_le_bail_d_un_autre_n_entre_pas(): void
    {
        $agency = $this->agency();
        $mine = $this->lease($agency);
        $this->due($mine, ['amount' => 100_000, 'status' => PaymentStatus::Pending, 'due_date' => '2026-11-01']);
        $other = Lease::factory()->create(['agency_id' => $agency->id, 'tenant_id' => Customer::factory()->create(['user_id' => User::factory()->create()->id])->id, 'status' => LeaseStatus::Active]);
        $this->due($other, ['amount' => 999_000, 'status' => PaymentStatus::Pending, 'due_date' => '2026-11-01']);

        $this->assertEquals(100000, $this->summary()['total_due']);
    }

    /** Sans bail : 200, total nul, état nul — pas `none`, qui dit « bail sans échéancier ». */
    public function test_sans_bail_l_etat_est_nul(): void
    {
        $this->tenant = User::factory()->create();

        $data = $this->summary();

        $this->assertNull($data['schedule_state']);
        $this->assertNull($data['lease']);
        $this->assertEquals(0, $data['total_due']);
    }

    public function test_un_invite_recoit_401(): void
    {
        $this->getJson('/api/me/rent-summary')->assertUnauthorized();
    }
}
