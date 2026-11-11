<?php

namespace Tests\Feature\Payout;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\TestCase;

/**
 * TCK-2649 (ADR-0100) — `properties[]` du relevé nomme chaque bien du bailleur, son locataire, le
 * loyer attendu et l'état du mois. Avant : une ligne par bien qui avait ENCAISSÉ, sans titre ni
 * locataire — un bien vacant ou impayé, celui dont le bailleur veut la ligne, n'y figurait pas.
 */
class OwnerStatementPropertiesTest extends TestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->moneyAgency();
        $this->landlord = $this->landlordOf($this->agency);
    }

    private function property(string $title, ?User $owner = null): Property
    {
        return Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => ($owner ?? $this->landlord)->id, 'title' => $title]);
    }

    /** @param  array<string, mixed>  $attributes */
    private function lease(Property $property, string $tenant, array $attributes = []): Lease
    {
        [$first, $last] = explode(' ', $tenant);

        return Lease::factory()->create($attributes + [
            'property_id' => $property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $property->user_id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id, 'first_name' => $first, 'last_name' => $last])->id,
            'status' => LeaseStatus::Active,
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
            'commission_rate' => 10,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    private function rent(Lease $lease, string $due, PaymentStatus $status, array $attributes = []): LeasePayment
    {
        return LeasePayment::factory()->create($attributes + [
            'lease_id' => $lease->id,
            'payment_type' => LeasePaymentType::Rent,
            'amount' => 300_000,
            'status' => $status,
            'paid_at' => $status === PaymentStatus::Paid ? $due.' 10:00:00' : null,
            'due_date' => $due,
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
            'late_fee_paid_at' => null,
        ]);
    }

    /** @return array<string, array<string, mixed>> les lignes, par titre */
    private function rows(string $period = '2026-11'): array
    {
        Sanctum::actingAs($this->landlord);

        return array_column($this->getJson("/api/owner-statements?period={$period}")->assertOk()->json('data.properties'), null, 'title');
    }

    /** AC4 — chaque bien porte son titre, son locataire et l'état du mois. */
    public function test_ac4_chaque_bien_porte_titre_locataire_loyer_attendu_et_etat_du_mois(): void
    {
        $paid = $this->lease($this->property('Villa Almadies'), 'Awa Ndiaye');
        $this->rent($paid, '2026-11-05', PaymentStatus::Paid);
        $this->rent($this->lease($this->property('F3 Mermoz'), 'Moussa Fall'), '2026-11-05', PaymentStatus::Late);
        $this->rent($this->lease($this->property('Studio Ouakam'), 'Fatou Diop'), '2026-11-20', PaymentStatus::PartiallyPaid, ['metadata' => ['paid_amount' => 100_000]]);
        $this->rent($this->lease($this->property('F2 Sacré-Cœur'), 'Ibou Sarr'), '2026-11-25', PaymentStatus::Pending);
        $this->lease($this->property('F4 Point E'), 'Aïda Ba');
        $this->property('Terrain Ngor');
        // Un bien archivé avant la période n'a plus de ligne ; archivé pendant, il la garde.
        $this->property('Archivé Avant')->forceFill(['archived_at' => '2026-10-15 10:00:00'])->save();
        $this->property('Archivé Pendant')->forceFill(['archived_at' => '2026-11-03 10:00:00'])->save();
        // Un bail échu en septembre ne loue plus le bien en novembre.
        $this->lease($this->property('Duplex Yoff'), 'Ancien Locataire', ['status' => LeaseStatus::Expired, 'end_date' => '2026-09-30']);

        $rows = $this->rows();

        $this->assertSame(['Villa Almadies', 'F3 Mermoz', 'Studio Ouakam', 'F2 Sacré-Cœur', 'F4 Point E', 'Terrain Ngor', 'Archivé Pendant', 'Duplex Yoff'], array_keys($rows), 'le bien qui a encaissé en tête, puis les autres');
        $state = fn (string $t) => [$rows[$t]['tenant_name'], $rows[$t]['month_status'], $rows[$t]['days_late'], (int) $rows[$t]['expected_rent']];
        $this->assertSame(['Awa Ndiaye', 'paid', null, 300000], $state('Villa Almadies'));
        $this->assertSame(['Moussa Fall', 'late', 6, 300000], $state('F3 Mermoz'));
        $this->assertSame(['Fatou Diop', 'partial', null, 300000], $state('Studio Ouakam'));
        $this->assertSame(['Ibou Sarr', 'due', null, 300000], $state('F2 Sacré-Cœur'));
        $this->assertSame(['Aïda Ba', 'none', null, 0], $state('F4 Point E'));
        $this->assertSame([null, 'vacant', null, 0], $state('Terrain Ngor'));
        $this->assertSame([null, 'vacant', null, 0], $state('Duplex Yoff'));

        // La ligne qui a encaissé garde ses chiffres ; les autres sont à zéro et marquées.
        $this->assertEquals([300000, 30000, 270000, true], [$rows['Villa Almadies']['collected'], $rows['Villa Almadies']['commission'], $rows['Villa Almadies']['net'], $rows['Villa Almadies']['has_movements']]);
        $this->assertEquals([0, 0, false], [$rows['F3 Mermoz']['collected'], $rows['F3 Mermoz']['net'], $rows['F3 Mermoz']['has_movements']]);
    }

    /** Une échéance échue partiellement payée est en retard, pas « partielle » : le retard prime. */
    public function test_un_reste_echu_partiellement_paye_est_en_retard(): void
    {
        $this->rent($this->lease($this->property('F3 Mermoz'), 'Moussa Fall'), '2026-11-01', PaymentStatus::PartiallyPaid, ['metadata' => ['paid_amount' => 100_000]]);

        $this->assertSame(['late', 10], [$this->rows()['F3 Mermoz']['month_status'], $this->rows()['F3 Mermoz']['days_late']]);
    }

    /** Le relevé d'un bailleur ne nomme ni les biens ni les locataires d'un autre bailleur de l'agence. */
    public function test_les_biens_d_un_autre_bailleur_n_y_sont_pas(): void
    {
        $other = $this->landlordOf($this->agency);
        $this->rent($this->lease($this->property('Chez Autrui', $other), 'Secret Voisin'), '2026-11-05', PaymentStatus::Late);
        $this->property('Mon Bien');

        $rows = $this->rows();

        $this->assertSame(['Mon Bien'], array_keys($rows));
        $this->assertStringNotContainsString('Voisin', (string) json_encode($rows));
    }

    /** Annuel : l'état se juge sur les échéances de l'année. */
    public function test_l_attestation_annuelle_juge_l_etat_sur_l_annee(): void
    {
        $lease = $this->lease($this->property('Villa Almadies'), 'Awa Ndiaye');
        $this->rent($lease, '2026-10-05', PaymentStatus::Paid, ['period_start' => '2026-10-01']);
        $this->rent($lease, '2026-11-05', PaymentStatus::Late);

        $row = $this->rows('2026')['Villa Almadies'];

        $this->assertSame(['late', 6], [$row['month_status'], $row['days_late']]);
        $this->assertEquals(600000, $row['expected_rent']);
    }

    /** Le PDF n'imprime que les biens qui ont bougé, comme avant ; le CSV ne lit que les lignes. */
    public function test_les_exports_restent_ceux_d_avant(): void
    {
        $paid = $this->lease($this->property('Villa Almadies'), 'Awa Ndiaye');
        $this->rent($paid, '2026-11-05', PaymentStatus::Paid);
        $vacant = $this->property('Terrain Ngor');
        Sanctum::actingAs($this->landlord);
        $statement = $this->getJson('/api/owner-statements?period=2026-11')->json('data');
        $this->assertCount(2, $statement['properties']);

        $html = view('pdf.statements.owner', ['title' => 'Relevé', 'document_label' => 'Relevé', 'agency' => $this->agency, 'statement' => $statement])->render();

        $this->assertStringContainsString('#'.$paid->property_id.'<', $html);
        $this->assertStringNotContainsString('#'.$vacant->id.'<', $html);

        $csv = $this->get('/api/owner-statements/csv?period=2026-11')->assertOk()->streamedContent();
        $this->assertStringNotContainsString((string) $vacant->id.';', $csv);
    }
}
