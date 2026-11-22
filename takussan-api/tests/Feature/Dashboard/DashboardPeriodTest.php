<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\KpiConfig;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Dashboard\PeriodeDuTableauDeBord;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2791 — `period=last_month` sur `/api/dashboard/agency`, `/agent` et `/owner` : les chiffres « du mois »
 * suivent la période, les états du jour restent ceux d'aujourd'hui (et le disent par `period.as_of_today`),
 * une valeur hors de la liste rend 422, et la période ne change aucun droit.
 *
 * Chaque cas pose un VOISIN en octobre (une autre agence, un autre agent, un autre bailleur) : le mois dernier
 * se lit dans le périmètre, jamais au-delà.
 */
class DashboardPeriodTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // AC1 : « le 13 novembre ».
        $this->travelTo(Carbon::parse('2026-11-13 10:00:00', 'Africa/Dakar'));
    }

    private function encaisse(Lease $lease, string $payeLe, int $montant, PaymentStatus $statut = PaymentStatus::Paid): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => $montant,
            'payment_type' => LeasePaymentType::Rent,
            'status' => $statut,
            'due_date' => substr($payeLe, 0, 10),
            'period_start' => substr($payeLe, 0, 8).'01',
            'paid_at' => $statut === PaymentStatus::Paid ? Carbon::parse($payeLe, 'Africa/Dakar') : null,
        ]);
    }

    /** @return array{0: Agency, 1: User} */
    private function agenceEtSonAdmin(): array
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        return [$agency, $admin];
    }

    /** AC1. */
    public function test_ac1_agency_last_month_serves_october_and_its_collected_rent(): void
    {
        [$agency] = $this->agenceEtSonAdmin();
        $bail = Lease::factory()->active()->create(['agency_id' => $agency->id, 'monthly_rent' => 100_000, 'commission_amount' => 0]);
        $this->encaisse($bail, '2026-10-15 12:00:00', 100_000);
        $this->encaisse($bail, '2026-11-05 12:00:00', 40_000);
        // Une échéance d'octobre impayée : l'impayé EN COURS, état du jour, le même dans les deux périodes.
        $this->encaisse($bail, '2026-10-20 00:00:00', 30_000, PaymentStatus::Late);
        // Le voisin : une autre agence encaisse en octobre.
        $voisin = Lease::factory()->active()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->encaisse($voisin, '2026-10-10 12:00:00', 999_000);

        $passe = $this->apiGet('/api/dashboard/agency?period=last_month&include=timeseries&months=2')->assertOk();
        $passe->assertJsonPath('data.period.key', 'last_month')
            ->assertJsonPath('data.period.start', '2026-10-01T00:00:00+00:00')
            ->assertJsonPath('data.period.end', '2026-10-31T23:59:59+00:00');
        $this->assertEquals(100_000.0, $passe->json('data.finance.revenue_month'));
        // L'invariant : le mois servi est le point d'octobre de la série.
        $this->assertSame(['2026-10', '2026-11'], $passe->json('timeseries.months'));
        $this->assertEquals($passe->json('timeseries.revenue.0'), $passe->json('data.finance.revenue_month'));
        $this->assertContains('finance.overdue_count', $passe->json('data.period.as_of_today'));
        $this->assertContains('occupancy.rate_percent', $passe->json('data.period.as_of_today'));
        $this->assertNotContains('finance.revenue_month', $passe->json('data.period.as_of_today'));

        $courant = $this->apiGet('/api/dashboard/agency')->assertOk();
        $courant->assertJsonPath('data.period.key', 'current_month')
            ->assertJsonPath('data.period.start', '2026-11-01T00:00:00+00:00');
        $this->assertEquals(40_000.0, $courant->json('data.finance.revenue_month'));
        $this->assertSame($courant->json('data.finance.overdue_count'), $passe->json('data.finance.overdue_count'));
        $this->assertSame(1, $passe->json('data.finance.overdue_count'));
    }

    public function test_agency_commission_and_configured_tiles_follow_the_period(): void
    {
        [$agency] = $this->agenceEtSonAdmin();
        Lease::factory()->active()->create(['agency_id' => $agency->id, 'commission_amount' => 50_000, 'signed_at' => Carbon::parse('2026-10-20 12:00:00')]);
        Lease::factory()->active()->create(['agency_id' => Agency::factory()->create()->id, 'commission_amount' => 777_000, 'signed_at' => Carbon::parse('2026-10-20 12:00:00')]);
        KpiConfig::query()->create(['agency_id' => $agency->id, 'metric' => 'commission_month', 'label' => 'Commission', 'format' => 'currency', 'is_enabled' => true, 'sort_order' => 1]);
        KpiConfig::query()->create(['agency_id' => $agency->id, 'metric' => 'leases_active', 'label' => 'Baux', 'format' => 'number', 'is_enabled' => true, 'sort_order' => 2]);

        $passe = $this->apiGet('/api/dashboard/agency?period=last_month')->assertOk();
        $this->assertEquals(50_000.0, $passe->json('data.finance.commission_month'));
        $this->assertEquals(50_000.0, $passe->json('data.kpis.0.value'));
        $this->assertFalse($passe->json('data.kpis.0.as_of_today'));
        $this->assertTrue($passe->json('data.kpis.1.as_of_today'));

        $this->assertEquals(0.0, $this->apiGet('/api/dashboard/agency')->assertOk()->json('data.finance.commission_month'));
    }

    public function test_agent_last_month_reads_only_his_own_october_ledger(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $autre = $this->agencyAgent($agency);
        $ligne = fn (User $qui, string $le, int $montant) => CommissionEntry::factory()->create([
            'agency_id' => $agency->id, 'beneficiary_id' => $qui->id, 'amount' => $montant, 'earned_at' => Carbon::parse($le),
        ]);
        $ligne($agent, '2026-10-12 12:00:00', 30_000);
        $ligne($agent, '2026-02-12 12:00:00', 5_000);
        $ligne($agent, '2026-11-02 12:00:00', 7_000);
        $ligne($autre, '2026-10-12 12:00:00', 900_000);
        $this->actingAsApi($agent);

        $passe = $this->getJson('/api/dashboard/agent?period=last_month&include=timeseries&months=2')->assertOk();
        $passe->assertJsonPath('data.period.key', 'last_month')->assertJsonPath('data.period.start', '2026-10-01T00:00:00+00:00');
        $this->assertEquals(30_000.0, $passe->json('data.finance.commissions_month'));
        $this->assertEquals($passe->json('timeseries.commissions.0'), $passe->json('data.finance.commissions_month'));
        // Le cumul de l'année à la fin du mois servi : février et octobre, pas novembre.
        $this->assertEquals(35_000.0, $passe->json('data.finance.commissions_year'));
        $this->assertContains('visits.upcoming_7d', $passe->json('data.period.as_of_today'));

        $courant = $this->getJson('/api/dashboard/agent')->assertOk();
        $this->assertEquals(7_000.0, $courant->json('data.finance.commissions_month'));
        $this->assertEquals(42_000.0, $courant->json('data.finance.commissions_year'));
    }

    /** La portée « Agence » de l'agent (sous `reports.view_agency`) : la commission de SON agence en octobre. */
    public function test_agent_agency_scope_last_month_reads_the_agency_commission_of_october(): void
    {
        [$agency, $admin] = $this->agenceEtSonAdmin();
        Lease::factory()->active()->create(['agency_id' => $agency->id, 'commission_amount' => 50_000, 'signed_at' => Carbon::parse('2026-10-20 12:00:00')]);
        Lease::factory()->active()->create(['agency_id' => $agency->id, 'commission_amount' => 20_000, 'signed_at' => Carbon::parse('2026-11-03 12:00:00')]);
        Lease::factory()->active()->create(['agency_id' => Agency::factory()->create()->id, 'commission_amount' => 777_000, 'signed_at' => Carbon::parse('2026-10-20 12:00:00')]);
        $this->actingAsApi($admin);

        $passe = $this->getJson('/api/dashboard/agent?scope=agency&period=last_month')->assertOk();
        $passe->assertJsonPath('data.scope', 'agency')->assertJsonPath('data.period.key', 'last_month');
        $this->assertEquals(50_000.0, $passe->json('data.finance.commissions_month'));
        $this->assertEquals(50_000.0, $passe->json('data.finance.commissions_year'));

        $courant = $this->getJson('/api/dashboard/agent?scope=agency')->assertOk();
        $this->assertEquals(20_000.0, $courant->json('data.finance.commissions_month'));
        $this->assertEquals(70_000.0, $courant->json('data.finance.commissions_year'));
    }

    public function test_owner_last_month_reads_only_his_october_rents(): void
    {
        $owner = $this->apiActingAsRole('owner');
        $bail = Lease::factory()->active()->create(['landlord_id' => $owner->id, 'monthly_rent' => 100_000]);
        $this->encaisse($bail, '2026-10-05 12:00:00', 100_000);
        $this->encaisse($bail, '2026-10-25 00:00:00', 100_000, PaymentStatus::Late);
        $this->encaisse($bail, '2026-11-05 12:00:00', 60_000);
        $voisin = Lease::factory()->active()->create(['landlord_id' => User::factory()->create()->id]);
        $this->encaisse($voisin, '2026-10-05 12:00:00', 888_000);

        $passe = $this->apiGet('/api/dashboard/owner?period=last_month&include=timeseries&months=2')->assertOk();
        $passe->assertJsonPath('data.period.key', 'last_month')
            ->assertJsonPath('data.finance.rent_month.expected_count', 2)
            ->assertJsonPath('data.finance.rent_month.received_count', 1);
        $this->assertEquals(100_000.0, $passe->json('data.finance.cashflow_month'));
        $this->assertEquals(100_000.0, $passe->json('data.finance.rent_month.received_amount'));
        $this->assertEquals($passe->json('timeseries.cashflow.0'), $passe->json('data.finance.cashflow_month'));
        $this->assertContains('finance.expected_monthly', $passe->json('data.period.as_of_today'));

        $courant = $this->apiGet('/api/dashboard/owner')->assertOk();
        $this->assertEquals(60_000.0, $courant->json('data.finance.cashflow_month'));
        $courant->assertJsonPath('data.finance.rent_month.expected_count', 1);
    }

    /**
     * Chaque chemin de `period.as_of_today` désigne une clé de la réponse : un chemin renommé plus tard rougit ici au
     * lieu de laisser un écran présenter, sans marque, un état du jour comme celui du mois dernier.
     */
    public function test_every_as_of_today_path_exists_in_the_response(): void
    {
        $verifier = function (array $data, string $endpoint): void {
            $chemins = $data['period']['as_of_today'];
            $this->assertNotEmpty($chemins, $endpoint);
            foreach ($chemins as $chemin) {
                $this->assertTrue(Arr::has($data, $chemin), "{$endpoint} : `{$chemin}` absent de la réponse");
            }
        };

        [$agency] = $this->agenceEtSonAdmin();
        $verifier($this->apiGet('/api/dashboard/agency?period=last_month')->assertOk()->json('data'), 'agency');

        $this->actingAsApi($this->agencyAgent($agency));
        $verifier($this->getJson('/api/dashboard/agent?period=last_month')->assertOk()->json('data'), 'agent');

        $this->apiActingAsRole('owner');
        $verifier($this->apiGet('/api/dashboard/owner?period=last_month')->assertOk()->json('data'), 'owner');
    }

    /** AC2. */
    public function test_ac2_an_unknown_period_is_rejected_on_the_three_endpoints(): void
    {
        $this->agenceEtSonAdmin();
        foreach (['period=yesterday', 'period[]=last_month', 'period=LAST_MONTH'] as $requete) {
            $this->apiGet("/api/dashboard/agency?{$requete}")->assertStatus(422)->assertJsonPath('code', 'dashboard.invalid_period');
        }

        $this->actingAsApi($this->agencyAgent(Agency::factory()->create()));
        $this->getJson('/api/dashboard/agent?period=yesterday')->assertStatus(422)->assertJsonPath('code', 'dashboard.invalid_period');

        $this->apiActingAsRole('owner');
        $this->apiGet('/api/dashboard/owner?period=yesterday')->assertStatus(422)->assertJsonPath('code', 'dashboard.invalid_period');
    }

    /** AC3 — la période ne change aucun droit, et une période invalide ne renseigne pas qui n'en a pas. */
    public function test_ac3_the_period_opens_no_right(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsApi($this->agencyAgent($agency));

        $this->getJson('/api/dashboard/agent?scope=agency')->assertForbidden();
        $this->getJson('/api/dashboard/agent?scope=agency&period=last_month')->assertForbidden();
        $this->getJson('/api/dashboard/agent?scope=agency&period=yesterday')->assertForbidden();
        $this->getJson('/api/dashboard/agency?period=last_month')->assertForbidden();
        $this->getJson('/api/dashboard/agency?period=yesterday')->assertForbidden();
        $this->getJson('/api/dashboard/owner?period=last_month')->assertForbidden();
        $this->getJson('/api/dashboard/owner?period=yesterday')->assertForbidden();
    }

    /** Le 31 : le mois dernier est le mois d'avant, jamais le même mois (`subMonth()` déborde). */
    public function test_on_the_31st_last_month_is_the_previous_month(): void
    {
        $this->travelTo(Carbon::parse('2026-10-31 18:00:00', 'Africa/Dakar'));
        $this->agenceEtSonAdmin();

        $this->apiGet('/api/dashboard/agency?period=last_month')->assertOk()
            ->assertJsonPath('data.period.start', '2026-09-01T00:00:00+00:00')
            ->assertJsonPath('data.period.end', '2026-09-30T23:59:59+00:00');
    }

    /** Le 1er du mois à minuit (heure de Dakar) : le mois en cours vient de commencer, le mois dernier est le précédent. */
    public function test_on_the_first_at_midnight_in_dakar(): void
    {
        $this->travelTo(Carbon::parse('2026-11-01 00:00:00', 'Africa/Dakar'));
        $this->agenceEtSonAdmin();

        $this->apiGet('/api/dashboard/agency')->assertOk()
            ->assertJsonPath('data.period.start', '2026-11-01T00:00:00+00:00');
        $this->apiGet('/api/dashboard/agency?period=last_month')->assertOk()
            ->assertJsonPath('data.period.start', '2026-10-01T00:00:00+00:00')
            ->assertJsonPath('data.period.end', '2026-10-31T23:59:59+00:00');
    }

    /**
     * Le mois se juge au calendrier de Dakar. Dakar étant à UTC+0 comme l'application, seul un fuseau
     * d'application décalé distingue les deux : le 31 octobre à 20 h à Dakar est déjà le 1er novembre à Tokyo.
     */
    public function test_the_month_is_judged_on_the_dakar_calendar(): void
    {
        $fuseau = date_default_timezone_get();
        $config = config('app.timezone');
        try {
            config(['app.timezone' => 'Asia/Tokyo']);
            date_default_timezone_set('Asia/Tokyo');
            $this->travelTo(CarbonImmutable::parse('2026-10-31 20:00:00', 'Africa/Dakar'));

            $courant = PeriodeDuTableauDeBord::pour(PeriodeDuTableauDeBord::CURRENT_MONTH);
            $this->assertSame('2026-10', $courant->mois());
            $this->assertTrue($courant->debut->equalTo(CarbonImmutable::parse('2026-10-01 00:00:00', 'Africa/Dakar')));
            $this->assertTrue($courant->fin->equalTo(CarbonImmutable::parse('2026-10-31 23:59:59.999999', 'Africa/Dakar')));
            $this->assertSame('2026-09', PeriodeDuTableauDeBord::pour(PeriodeDuTableauDeBord::LAST_MONTH)->mois());
        } finally {
            config(['app.timezone' => $config]);
            date_default_timezone_set($fuseau);
        }
    }
}
