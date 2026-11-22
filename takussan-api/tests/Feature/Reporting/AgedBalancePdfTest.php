<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Support\Blade\CurrencyDirective;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\View;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2866 — AC1 : `GET /api/agencies/{agency}/finance/aging.pdf` imprime la balance âgée que
 * `GET …/finance/aging` lit en JSON (une seule source : `AgingBalanceService::forAgency()`) — mêmes
 * tranches, mêmes totaux —, filtre bailleur compris, sous la même garde (`viewReports`).
 *
 * Le PDF est rendu pour de vrai (dompdf en test) ; ce qu'il imprime se lit sur la vue qu'il rend : les
 * données reçues par `pdf.reports.aged-balance` (relevées par un compositeur de vue) et son HTML.
 */
class AgedBalancePdfTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $l1;

    /** @var array<string, mixed>|null */
    private ?array $vue = null;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-07-15 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->l1 = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $l2 = User::factory()->create();

        // Trois tranches : 1-30 (10 j), 31-60 (40 j), 61-90 (75 j) ; L2 seul a la plus ancienne.
        $this->echeance($this->bail($this->l1), 100_000, 10);
        $this->echeance($this->bail($this->l1), 120_000, 40);
        $this->echeance($this->bail($l2), 90_000, 10);
        $this->echeance($this->bail($l2), 250_000, 75);

        View::composer('pdf.reports.aged-balance', function ($view): void {
            $this->vue = $view->getData();
        });
    }

    private function bail(User $landlord): Lease
    {
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);

        return Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'status' => LeaseStatus::Active,
            'late_fee_percent' => null,
        ]);
    }

    private function echeance(Lease $lease, float $amount, int $daysLate): void
    {
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Pending,
            'amount' => $amount,
            'due_date' => now()->subDays($daysLate)->toDateString(),
            'paid_at' => null,
        ]);
    }

    /** @return array<string, mixed> la balance reçue par la vue du PDF */
    private function pdf(string $requete = ''): array
    {
        $response = $this->actingAsApi($this->admin)->get("/api/agencies/{$this->agency->id}/finance/aging.pdf{$requete}")->assertOk();
        $this->assertStringContainsString('application/pdf', (string) $response->headers->get('Content-Type'));
        $this->assertStringStartsWith('%PDF-', (string) $response->getContent());
        $this->assertNotNull($this->vue, 'la vue du PDF n’a pas été rendue');

        return $this->vue['balance'];
    }

    /** @param  array<string, mixed>  $balance */
    private function assertImprime(array $balance): void
    {
        $html = view('pdf.reports.aged-balance', $this->vue)->render();
        foreach ($balance['buckets'] as $bucket => $cell) {
            $this->assertStringContainsString(CurrencyDirective::render($cell['amount'], 'XOF'), $html, $bucket);
        }
        $this->assertStringContainsString(CurrencyDirective::render($balance['total']['amount'], 'XOF'), $html);
    }

    public function test_ac1_le_pdf_porte_les_totaux_par_tranche_de_la_lecture_json(): void
    {
        $json = $this->actingAsApi($this->admin)->getJson("/api/agencies/{$this->agency->id}/finance/aging")->assertOk()->json('data');
        $imprime = $this->pdf();

        $this->assertSame($json['buckets'], json_decode(json_encode($imprime['buckets']), true));
        $this->assertSame($json['total'], json_decode(json_encode($imprime['total']), true));
        // Trois tranches non vides, et les montants attendus.
        $this->assertEquals(190_000, $imprime['buckets']['1_30']['amount']);
        $this->assertEquals(120_000, $imprime['buckets']['31_60']['amount']);
        $this->assertEquals(250_000, $imprime['buckets']['61_90']['amount']);
        $this->assertEquals(560_000, $imprime['total']['amount']);
        $this->assertImprime($imprime);
    }

    public function test_le_filtre_bailleur_vaut_pour_le_json_et_le_pdf(): void
    {
        $json = $this->actingAsApi($this->admin)
            ->getJson("/api/agencies/{$this->agency->id}/finance/aging?filter[landlord_id]={$this->l1->id}")
            ->assertOk()->json('data');
        $imprime = $this->pdf("?filter[landlord_id]={$this->l1->id}");

        $this->assertEquals(220_000, $json['total']['amount']);
        $this->assertSame($json['buckets'], json_decode(json_encode($imprime['buckets']), true));
        $this->assertEquals(0, $imprime['buckets']['61_90']['amount']);
        $this->assertSame('Awa Ndiaye', $this->vue['landlord_name']);
        $this->assertImprime($imprime);
    }

    public function test_meme_garde_que_la_lecture(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $this->actingAsApi($agent)->get("/api/agencies/{$this->agency->id}/finance/aging.pdf")->assertForbidden();
        $this->actingAsApi(User::factory()->create())->get("/api/agencies/{$this->agency->id}/finance/aging.pdf")->assertForbidden();
    }

    public function test_un_bailleur_mal_forme_est_refuse(): void
    {
        $this->actingAsApi($this->admin)->getJson("/api/agencies/{$this->agency->id}/finance/aging.pdf?filter[landlord_id]=abc")
            ->assertStatus(422)->assertJsonPath('code', 'reporting.invalid_landlord');
        $this->actingAsApi($this->admin)->getJson("/api/agencies/{$this->agency->id}/finance/aging?filter[landlord_id][]=1")
            ->assertStatus(422);
    }
}
