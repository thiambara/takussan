<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Export\ExportDataService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-1308 (piste P112.03) — un export coupé au plafond le dit. L'API demande une ligne de plus
 * que le plafond : si elle existe, elle est retirée du fichier et la réponse porte
 * `X-Export-Truncated: <lignes rendues>`. Rien n'est ajouté au fichier.
 *
 * Avant : 5 001 paiements sans `limit` rendaient 5 000 lignes, sans aucun signal (mesuré).
 */
class ExportCoupureSignaleeTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private Lease $lease;

    private Customer $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);
        $this->tenant = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $this->lease = Lease::factory()->active()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => $this->tenant->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    public function test_au_plafond_plus_un_l_export_signale_la_coupure(): void
    {
        $this->insererPaiements(ExportDataService::DEFAULT_ROWS + 1);

        $reponse = $this->actingAsApi($this->agencyAdmin($this->agency))
            ->get('/api/export/payments?format=csv')
            ->assertOk()
            ->assertHeader('X-Export-Truncated', (string) ExportDataService::DEFAULT_ROWS);

        // L'en-tête CSV, puis 5 000 lignes : la ligne de trop n'est pas écrite.
        $lignes = array_filter(explode("\n", $reponse->streamedContent()));
        $this->assertCount(ExportDataService::DEFAULT_ROWS + 1, $lignes);
        // Tri décroissant par échéance : c'est la plus ancienne qui est laissée de côté.
        $this->assertStringNotContainsString(sprintf('LPY-%06d', ExportDataService::DEFAULT_ROWS + 1), $reponse->streamedContent());
    }

    public function test_au_plafond_exact_l_export_ne_signale_rien(): void
    {
        $this->insererPaiements(ExportDataService::DEFAULT_ROWS);

        $reponse = $this->actingAsApi($this->agencyAdmin($this->agency))
            ->get('/api/export/payments?format=csv')
            ->assertOk()
            ->assertHeaderMissing('X-Export-Truncated');

        $this->assertCount(ExportDataService::DEFAULT_ROWS + 1, array_filter(explode("\n", $reponse->streamedContent())));
    }

    public function test_une_limite_demandee_est_signalee_de_meme(): void
    {
        $this->insererPaiements(3);
        $admin = $this->agencyAdmin($this->agency);

        $this->actingAsApi($admin)->get('/api/export/payments?format=xlsx&limit=2')
            ->assertOk()
            ->assertHeader('X-Export-Truncated', '2');

        $this->actingAsApi($admin)->get('/api/export/payments?format=xlsx&limit=3')
            ->assertOk()
            ->assertHeaderMissing('X-Export-Truncated');
    }

    public function test_le_pdf_coupe_le_signale_aussi(): void
    {
        $this->insererPaiements(3);

        $this->actingAsApi($this->agencyAdmin($this->agency))
            ->get('/api/export/payments?format=pdf&limit=2')
            ->assertOk()
            ->assertHeader('X-Export-Truncated', '2');
    }

    private function insererPaiements(int $n): void
    {
        $now = now();
        foreach (array_chunk(range(1, $n), 1000) as $chunk) {
            DB::table('lease_payments')->insert(array_map(fn (int $i) => [
                'lease_id' => $this->lease->id,
                'payer_id' => $this->tenant->id,
                'reference_number' => sprintf('LPY-%06d', $i),
                'amount' => 150000,
                'currency' => 'XOF',
                'payment_method' => 'wave',
                'payment_type' => 'rent',
                'period_start' => $now->copy()->startOfMonth()->toDateString(),
                'period_end' => $now->copy()->endOfMonth()->toDateString(),
                'due_date' => $now->copy()->subDays($i)->toDateString(),
                'status' => 'pending',
                'created_at' => $now,
                'updated_at' => $now,
            ], $chunk));
        }
    }
}
