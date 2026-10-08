<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-595 (§7, AC19) — les exports financiers : `payouts`, `invoices`, `commissions`, `aging`,
 * `deposits`. Chacun rend un CSV limité à l'agence de l'acteur, et exige `reports.export`.
 *
 * Deux agences portent chacune une ligne de chaque type, marquée par une référence propre : la
 * ligne de l'autre agence ne doit jamais figurer dans l'export.
 */
class ExportReportingTypesTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private Agency $other;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->other = Agency::factory()->create();

        $this->seedAgency($this->agency, 'A');
        $this->seedAgency($this->other, 'B');
    }

    /** @return array<string, array{string}> */
    public static function entities(): array
    {
        return [
            'reversements' => ['payouts'],
            'factures' => ['invoices'],
            'commissions' => ['commissions'],
            'balance âgée' => ['aging'],
            'cautions' => ['deposits'],
        ];
    }

    #[DataProvider('entities')]
    public function test_l_export_ne_rend_que_l_agence_de_l_acteur(string $entity): void
    {
        $body = $this->actingAsApi($this->agencyAdmin($this->agency))
            ->getJson("/api/export/{$entity}?format=csv")
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString("{$entity}-A", $body, 'la ligne de l’agence doit y figurer');
        $this->assertStringNotContainsString("{$entity}-B", $body, 'une ligne d’une autre agence n’y figure jamais');
    }

    #[DataProvider('entities')]
    public function test_sans_reports_export_la_reponse_est_403(string $entity): void
    {
        $this->actingAsApi($this->adminWithout($this->agency, Capability::ReportsExport))
            ->getJson("/api/export/{$entity}?format=csv")
            ->assertForbidden()
            ->assertJsonPath('code', 'export.forbidden');
    }

    #[DataProvider('entities')]
    public function test_le_bailleur_n_exporte_pas_les_finances_de_l_agence(string $entity): void
    {
        $this->actingAsApi(User::factory()->withOwnerProfile($this->agency)->create())
            ->getJson("/api/export/{$entity}?format=csv")
            ->assertForbidden()
            ->assertJsonPath('code', 'export.forbidden');
    }

    public function test_la_balance_agee_porte_le_retard_et_la_tranche(): void
    {
        $body = $this->actingAsApi($this->agencyAdmin($this->agency))
            ->getJson('/api/export/aging?format=csv')
            ->assertOk()
            ->streamedContent();

        $row = $this->rowFor($body, 'aging-A');
        $this->assertSame('40', $row['days_overdue']);
        $this->assertSame('31_60', $row['bucket']);
        // Une échéance `pending` échue est un impayé, qu'elle soit passée `late` ou non.
        $this->assertSame('pending', $row['status']);
    }

    public function test_les_cautions_detenues_sont_encaissees_moins_restituees(): void
    {
        $body = $this->actingAsApi($this->agencyAdmin($this->agency))
            ->getJson('/api/export/deposits?format=csv')
            ->assertOk()
            ->streamedContent();

        $row = $this->rowFor($body, 'deposits-A');
        $this->assertSame(300000.0, (float) $row['collected']);
        $this->assertSame(100000.0, (float) $row['refunded']);
        $this->assertSame(200000.0, (float) $row['held']);
    }

    private function seedAgency(Agency $agency, string $tag): void
    {
        $landlord = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);
        $tenant = Customer::factory()->create(['agency_id' => $agency->id]);
        $lease = Lease::factory()->active()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
            'reference_number' => "commissions-{$tag}",
        ]);
        // Le bail des cautions porte sa propre référence : l'export des cautions ne rend que des baux.
        $depositLease = Lease::factory()->active()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
            'reference_number' => "deposits-{$tag}",
        ]);

        Payout::factory()->create([
            'agency_id' => $agency->id,
            'landlord_id' => $landlord->id,
            'lease_id' => $lease->id,
            'reference_number' => "payouts-{$tag}",
        ]);
        Invoice::factory()->create([
            'agency_id' => $agency->id,
            'customer_id' => $tenant->id,
            'reference_number' => "invoices-{$tag}",
        ]);
        CommissionEntry::factory()->create([
            'agency_id' => $agency->id,
            'lease_id' => $lease->id,
            'beneficiary_id' => User::factory()->create()->id,
        ]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'reference_number' => "aging-{$tag}",
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Pending,
            'amount' => 100000,
            'due_date' => now()->subDays(40)->toDateString(),
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

    /** @return array<string, string> la ligne du CSV qui contient `$marker`, indexée par colonne */
    private function rowFor(string $csv, string $marker): array
    {
        $lines = array_values(array_filter(
            preg_split('/\r?\n/', ltrim($csv, "\xEF\xBB\xBF")),
            static fn (string $line): bool => trim($line) !== '',
        ));
        $header = str_getcsv(array_shift($lines), ',', '"', '\\');
        foreach ($lines as $line) {
            $cells = str_getcsv($line, ',', '"', '\\');
            if (in_array($marker, $cells, true)) {
                return array_combine($header, $cells);
            }
        }
        $this->fail("aucune ligne ne porte {$marker}");
    }
}
