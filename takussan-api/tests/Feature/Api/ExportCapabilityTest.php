<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-587 (ADR-0031 §2, AC6) — exporter est un geste de direction : `crm.export`,
 * `payments.export`, `reports.export`. Avant ce ticket, `ExportController` ouvrait les quatre
 * exports à tout agent ou admin sans lire une seule de ces capacités, et n'en gardait aucune
 * trace.
 */
class ExportCapabilityTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();

        $landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);
        $tenant = Customer::factory()->create(['agency_id' => $this->agency->id]);
        Customer::factory()->count(2)->create(['agency_id' => $this->agency->id]);
        $lease = Lease::factory()->active()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $this->agency->id,
        ]);
        LeasePayment::factory()->count(2)->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
        ]);
    }

    /**
     * Chaque export, la capacité qui l'ouvre au personnel, et le rôle système qui la porte.
     *
     * @return array<string, array{string, Capability}>
     */
    public static function exports(): array
    {
        return [
            'clients' => ['customers', Capability::CrmExport],
            'paiements' => ['payments', Capability::PaymentsExport],
            'baux' => ['leases', Capability::ReportsExport],
            'biens' => ['properties', Capability::ReportsExport],
        ];
    }

    #[DataProvider('exports')]
    public function test_l_agent_du_role_systeme_n_exporte_pas(string $entity, Capability $capability): void
    {
        $this->actingAsApi($this->agencyAgent($this->agency))
            ->getJson("/api/export/{$entity}?format=csv")
            ->assertForbidden();

        $this->assertSame(0, Activity::query()->where('event', 'data_exported')->count());
    }

    /** AC12 — le rôle d'admin moins la capacité : refusé ; le rôle système : admis. */
    #[DataProvider('exports')]
    public function test_la_capacite_est_lue(string $entity, Capability $capability): void
    {
        $this->actingAsApi($this->adminWithout($this->agency, $capability))
            ->getJson("/api/export/{$entity}?format=csv")
            ->assertForbidden();

        $this->actingAsApi($this->agencyAdmin($this->agency))
            ->getJson("/api/export/{$entity}?format=csv")
            ->assertOk();
    }

    #[DataProvider('exports')]
    public function test_chaque_export_est_journalise_avec_le_nombre_de_lignes_rendues(string $entity, Capability $capability): void
    {
        $body = $this->actingAsApi($this->agencyAdmin($this->agency))
            ->getJson("/api/export/{$entity}?format=csv&from=2000-01-01")
            ->assertOk()
            ->streamedContent();

        $rows = $this->dataRows($body);
        $this->assertNotEmpty($rows, 'un export vide ne prouverait pas le compte');

        $activity = Activity::query()->where('event', 'data_exported')->sole();
        $this->assertSame('export', $activity->log_name);
        $this->assertSame($entity, $activity->properties['entity']);
        $this->assertSame(count($rows), $activity->properties['row_count']);
        $this->assertSame($this->agency->id, $activity->properties['agency_id']);
        $this->assertSame(['from' => '2000-01-01'], $activity->properties['filters']);
    }

    public function test_le_bailleur_exporte_ses_biens_et_seulement_les_siens(): void
    {
        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $siens = Property::factory()->count(2)->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id]);

        $body = $this->actingAsApi($bailleur)
            ->getJson('/api/export/properties?format=csv')
            ->assertOk()
            ->streamedContent();

        $ids = array_map(static fn (array $row): int => (int) $row[0], $this->dataRows($body));
        sort($ids);
        $this->assertSame($siens->pluck('id')->sort()->values()->all(), $ids);
    }

    public function test_le_bailleur_n_exporte_pas_le_crm(): void
    {
        $this->actingAsApi(User::factory()->withOwnerProfile($this->agency)->create())
            ->getJson('/api/export/customers?format=csv')
            ->assertForbidden()
            ->assertJsonPath('code', 'export.forbidden')->assertJsonPath('message', __('errors.export.forbidden'));
    }

    /** @return list<list<string>> */
    private function dataRows(string $csv): array
    {
        $lines = array_values(array_filter(
            preg_split('/\r?\n/', ltrim($csv, "\xEF\xBB\xBF")),
            static fn (string $line): bool => trim($line) !== '',
        ));
        array_shift($lines);

        return array_map(static fn (string $line): array => str_getcsv($line, ',', '"', '\\'), $lines);
    }
}
