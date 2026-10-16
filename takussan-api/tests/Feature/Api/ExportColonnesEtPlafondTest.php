<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-713 (piste P02.07) — l'export synchrone ne charge que les colonnes qu'il écrit, et il est
 * plafonné à 10 000 lignes, 2 000 en PDF.
 *
 * Les requêtes d'export sont relevées par `DB::listen` : aucune ne doit lire `*` sur une table
 * exportée. `preventAccessingMissingAttributes()` fait lever toute lecture d'une colonne oubliée
 * dans le `select`, au lieu de rendre une cellule vide en silence.
 */
class ExportColonnesEtPlafondTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->seedAgency($this->agency);
    }

    protected function tearDown(): void
    {
        Model::preventAccessingMissingAttributes(false);

        parent::tearDown();
    }

    /** @return array<string, array{string, string, string}> entité, table, marqueur de ligne */
    public static function entities(): array
    {
        return [
            'paiements' => ['payments', 'lease_payments', 'PAY-REF'],
            'baux' => ['leases', 'leases', 'LEASE-REF'],
            'clients' => ['customers', 'customers', 'client@example.test'],
            'biens' => ['properties', 'properties', 'PROP-REF'],
            'reversements' => ['payouts', 'payouts', 'PAYOUT-REF'],
            'factures' => ['invoices', 'invoices', 'INV-REF'],
            'commissions' => ['commissions', 'commission_entries', 'LEASE-REF'],
            'balance âgée' => ['aging', 'lease_payments', 'AGING-REF'],
            'cautions' => ['deposits', 'leases', 'DEPOSIT-REF'],
        ];
    }

    #[DataProvider('entities')]
    public function test_l_export_ne_lit_que_les_colonnes_qu_il_ecrit(string $entity, string $table, string $marker): void
    {
        $admin = $this->agencyAdmin($this->agency);
        Model::preventAccessingMissingAttributes();

        $sql = [];
        DB::listen(function ($query) use (&$sql) {
            $sql[] = $query->sql;
        });

        $body = $this->actingAsApi($admin)
            ->getJson("/api/export/{$entity}?format=csv")
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString($marker, $body);

        $etoile = array_values(array_filter(
            $sql,
            fn (string $q) => preg_match('/^select \* from "'.$table.'"|^select "'.$table.'"\.\* from/i', $q) === 1,
        ));
        $this->assertSame([], $etoile, "l'export {$entity} lit toutes les colonnes de {$table}");
    }

    public function test_la_balance_agee_garde_le_reste_du_d_un_paiement_partiel(): void
    {
        Model::preventAccessingMissingAttributes();

        $body = $this->actingAsApi($this->agencyAdmin($this->agency))
            ->getJson('/api/export/aging?format=csv')
            ->assertOk()
            ->streamedContent();

        // 100 000 dus, 30 000 reçus (metadata.paid_amount) : le reste dû est 70 000.
        $this->assertMatchesRegularExpression('/PARTIAL-REF[^\n]*,70000(\.0)?,/', $body);
    }

    public function test_au_dela_de_10_000_lignes_la_demande_est_refusee(): void
    {
        $admin = $this->agencyAdmin($this->agency);

        $this->actingAsApi($admin)
            ->getJson('/api/export/properties?format=csv&limit=10001')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('limit');

        $this->actingAsApi($admin)
            ->getJson('/api/export/properties?format=csv&limit=10000')
            ->assertOk();
    }

    public function test_au_dela_de_2_000_lignes_en_pdf_la_demande_est_refusee(): void
    {
        $admin = $this->agencyAdmin($this->agency);

        $this->actingAsApi($admin)
            ->getJson('/api/export/properties?format=pdf&limit=2001')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('limit');

        $this->actingAsApi($admin)
            ->getJson('/api/export/properties?format=xlsx&limit=2001')
            ->assertOk();
    }

    /** @return array<string, array{string, int}> */
    public static function plafondsParDefaut(): array
    {
        return [
            'csv' => ['csv', 5000],
            'pdf' => ['pdf', 2000],
        ];
    }

    #[DataProvider('plafondsParDefaut')]
    public function test_sans_limite_l_export_applique_le_plafond_du_format(string $format, int $attendu): void
    {
        $admin = $this->agencyAdmin($this->agency);

        $sql = [];
        DB::listen(function ($query) use (&$sql) {
            $sql[] = $query->sql;
        });

        $this->actingAsApi($admin)
            ->getJson("/api/export/properties?format={$format}")
            ->assertOk();

        $export = array_values(array_filter($sql, fn (string $q) => str_contains($q, 'from "properties"') && str_contains($q, ' limit ')));
        $this->assertNotEmpty($export, 'la requête d’export des biens est relevée');
        $this->assertStringEndsWith("limit {$attendu}", end($export));
    }

    private function seedAgency(Agency $agency): void
    {
        $landlord = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create([
            'user_id' => $landlord->id,
            'agency_id' => $agency->id,
            'reference_number' => 'PROP-REF',
        ]);
        $tenant = Customer::factory()->create(['agency_id' => $agency->id, 'email' => 'client@example.test']);
        $lease = Lease::factory()->active()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
            'reference_number' => 'LEASE-REF',
        ]);
        $depositLease = Lease::factory()->active()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
            'reference_number' => 'DEPOSIT-REF',
        ]);

        Payout::factory()->create([
            'agency_id' => $agency->id,
            'landlord_id' => $landlord->id,
            'lease_id' => $lease->id,
            'reference_number' => 'PAYOUT-REF',
        ]);
        Invoice::factory()->create([
            'agency_id' => $agency->id,
            'customer_id' => $tenant->id,
            'reference_number' => 'INV-REF',
        ]);
        CommissionEntry::factory()->create([
            'agency_id' => $agency->id,
            'lease_id' => $lease->id,
            'beneficiary_id' => User::factory()->create()->id,
        ]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'reference_number' => 'PAY-REF',
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
        ]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'reference_number' => 'AGING-REF',
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Pending,
            'amount' => 100000,
            'due_date' => now()->subDays(40)->toDateString(),
        ]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'reference_number' => 'PARTIAL-REF',
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::PartiallyPaid,
            'amount' => 100000,
            'metadata' => ['paid_amount' => 30000],
            'due_date' => now()->subDays(10)->toDateString(),
        ]);
        foreach ([[LeasePaymentType::Deposit, 300000], [LeasePaymentType::DepositRefund, 100000]] as [$type, $amount]) {
            LeasePayment::factory()->create([
                'lease_id' => $depositLease->id,
                'payer_id' => $tenant->id,
                'payment_type' => $type,
                'status' => PaymentStatus::Paid,
                'paid_at' => now(),
                'amount' => $amount,
            ]);
        }
    }
}
