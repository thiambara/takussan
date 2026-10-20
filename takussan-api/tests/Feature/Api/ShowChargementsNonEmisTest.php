<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Booking;
use App\Models\Enums\KycDossierStatus;
use App\Models\Invoice;
use App\Models\KycDossier;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-1028 (P60.02) — un `show` ne charge pas une relation que sa ressource n'émet pas.
 *
 * Chaque cas relève les requêtes de CHARGEMENT ANTICIPÉ, reconnues à leur forme SQL
 * `where "<table>"."<clé>" in (…)`. Une lecture par `find()` s'écrit `= ?` et ne compte pas : c'est
 * ainsi que `BookingMoneyAccess::canRefund` relit l'agence, et elle n'est pas en cause.
 *
 * Chaque cas vérifie aussi qu'une relation émise reste rendue : un `show` qui ne chargerait plus
 * rien serait vert sans cela.
 */
class ShowChargementsNonEmisTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @var list<string> */
    private array $requetes = [];

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function lire(string $uri): TestResponse
    {
        $this->requetes = [];
        DB::listen(function (QueryExecuted $q): void {
            $this->requetes[] = $q->sql;
        });

        return $this->apiGet($uri)->assertOk();
    }

    private function assertAucunChargement(string $table, string $cle, string $raison): void
    {
        $motif = sprintf('from "%s" where "%s"."%s" in', $table, $table, $cle);
        $trouvees = array_values(array_filter($this->requetes, fn (string $sql): bool => str_contains($sql, $motif)));

        $this->assertSame([], $trouvees, $raison);
    }

    public function test_le_detail_du_bail_ne_charge_pas_ses_paiements(): void
    {
        $this->apiActingAsRole('super_admin');
        $lease = Lease::factory()->create();

        $data = $this->lire("/api/leases/{$lease->id}")->json('data');

        $this->assertAucunChargement('lease_payments', 'lease_id', 'LeaseResource n\'émet pas `payments`');
        $this->assertArrayNotHasKey('payments', $data);
        $this->assertArrayHasKey('property', $data, 'une relation émise reste chargée');
    }

    public function test_le_detail_de_la_facture_ne_charge_pas_le_client(): void
    {
        $this->apiActingAsRole('super_admin');
        $invoice = Invoice::factory()->create();

        $data = $this->lire("/api/invoices/{$invoice->id}")->json('data');

        $this->assertAucunChargement('customers', 'id', 'InvoiceResource ne rend que `customer_id`');
        $this->assertSame($invoice->customer_id, $data['customer_id']);
        $this->assertArrayHasKey('credit_notes', $data, 'une relation émise reste chargée');
    }

    public function test_le_detail_de_la_reservation_ne_charge_pas_l_agence(): void
    {
        $this->apiActingAsRole('super_admin');
        $booking = Booking::factory()->create(['agency_id' => Agency::factory()->create()->id]);

        $data = $this->lire("/api/bookings/{$booking->id}")->json('data');

        $this->assertAucunChargement('agencies', 'id', 'BookingResource ne rend que `agency_id`');
        $this->assertSame($booking->agency_id, $data['agency_id']);
        $this->assertArrayHasKey('customer', $data, 'une relation émise reste chargée');
    }

    public function test_le_dossier_kyc_ne_charge_pas_son_relecteur(): void
    {
        $this->apiActingAsRole('super_admin');
        $reviewer = User::factory()->create();
        $dossier = KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => Agency::factory()->create()->id,
            'status' => KycDossierStatus::Verified,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
            'reviewed_by' => $reviewer->id,
        ]);

        $data = $this->lire("/api/admin/kyc/{$dossier->id}")->json('data');

        $this->assertAucunChargement('users', 'id', 'KycDossierResource ne rend que `reviewed_by`');
        $this->assertSame($reviewer->id, $data['reviewed_by']);
        $this->assertNotNull($data['subject'], 'une relation émise reste chargée');
    }

    public function test_le_releve_ignore_include_agency(): void
    {
        $this->apiActingAsRole('super_admin');
        $statement = BankStatement::factory()->create();

        $data = $this->lire("/api/bank-statements/{$statement->id}?include=agency,uploadedBy")->json('data');

        $this->assertAucunChargement('agencies', 'id', 'BankStatementResource ne rend que `agency_id`');
        $this->assertArrayNotHasKey('agency', $data);
        $this->assertSame($statement->uploaded_by, $data['uploaded_by']['id'], 'une relation émise reste chargée');
    }
}
