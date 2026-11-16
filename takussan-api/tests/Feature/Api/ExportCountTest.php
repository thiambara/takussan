<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Export\ExportDataService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2866 — AC5 : `GET /api/export/{entity}/count` rend `{count, limit}`, le nombre de lignes que le
 * fichier produit avec les MÊMES paramètres porterait (même requête : `ExportDataService::query()`),
 * et le plafond du format. Sous le droit de l'export, dans son ordre (404, 403, puis 422).
 */
class ExportCountTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);

        // Quatre baux de l'agence, commencés en septembre, octobre (×2) et novembre ; un d'ailleurs.
        foreach (['2026-09-10', '2026-10-02', '2026-10-20', '2026-11-03'] as $debut) {
            $this->bail($this->agency, $debut);
        }
        $this->bail(Agency::factory()->create(), '2026-10-05');
    }

    private function bail(Agency $agency, string $debut): Lease
    {
        $landlord = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);

        return Lease::factory()->active()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'agency_id' => $agency->id,
            'start_date' => $debut,
        ]);
    }

    /** Les lignes de données du CSV (l'en-tête retiré). */
    private function lignesDuFichier(string $entity, string $requete): int
    {
        $corps = $this->actingAsApi($this->admin)
            ->get("/api/export/{$entity}?format=csv&{$requete}")
            ->assertOk()
            ->streamedContent();

        return count(array_filter(explode("\n", trim($corps)))) - 1;
    }

    /** @return array{count: int, limit: int} */
    private function compte(string $entity, string $requete = ''): array
    {
        return $this->actingAsApi($this->admin)
            ->getJson("/api/export/{$entity}/count?{$requete}")
            ->assertOk()
            ->json('data');
    }

    public function test_ac5_le_compte_des_baux_est_celui_des_lignes_du_fichier_aux_memes_filtres(): void
    {
        foreach (['' => 4, 'from=2026-10-01&to=2026-10-31' => 2, 'from=2026-11-01' => 1] as $requete => $attendu) {
            $this->assertSame($attendu, $this->compte('leases', $requete)['count'], $requete);
            $this->assertSame($attendu, $this->lignesDuFichier('leases', $requete), $requete);
        }
    }

    public function test_le_compte_ignore_le_plafond_et_rend_celui_du_format(): void
    {
        $this->assertSame(['count' => 4, 'limit' => ExportDataService::DEFAULT_ROWS], $this->compte('leases'));
        $this->assertSame(['count' => 4, 'limit' => ExportDataService::MAX_ROWS_PDF], $this->compte('leases', 'format=pdf'));
        // Une limite demandée sous le nombre de lignes : le compte reste celui de la sélection.
        $this->assertSame(['count' => 4, 'limit' => 2], $this->compte('leases', 'limit=2'));
    }

    public function test_le_registre_des_encaissements_compte_avec_ses_filtres(): void
    {
        $bail = Lease::query()->where('agency_id', $this->agency->id)->firstOrFail();
        foreach ([[PaymentMethod::Wave, '2026-11-03'], [PaymentMethod::Cash, '2026-11-04'], [PaymentMethod::Wave, '2026-10-04']] as [$moyen, $payeLe]) {
            LeasePayment::factory()->create([
                'lease_id' => $bail->id, 'payer_id' => $bail->tenant_id, 'amount' => 100_000,
                'status' => PaymentStatus::Paid, 'paid_at' => "{$payeLe} 09:00:00", 'payment_method' => $moyen,
                'payment_type' => LeasePaymentType::Rent, 'due_date' => $payeLe,
            ]);
        }

        $requete = 'filter[paid_from]=2026-11-01&filter[paid_to]=2026-11-30&filter[payment_method]=wave';
        $this->assertSame(1, $this->compte('payment_history', $requete)['count']);
        $this->assertSame(1, $this->lignesDuFichier('payment_history', $requete));
        $this->assertSame(3, $this->compte('payment_history', 'filter[paid_from]=2026-10-01')['count']);
    }

    public function test_les_cautions_detenues_se_comptent_par_bail_comme_le_fichier(): void
    {
        $baux = Lease::query()->where('agency_id', $this->agency->id)->orderBy('id')->get();
        // Deux baux avec une caution détenue, un troisième intégralement restitué (aucune ligne).
        foreach ([[$baux[0], 300_000, 0], [$baux[1], 200_000, 50_000], [$baux[2], 100_000, 100_000]] as [$bail, $verse, $rendu]) {
            LeasePayment::factory()->create(['lease_id' => $bail->id, 'payer_id' => $bail->tenant_id, 'payment_type' => LeasePaymentType::Deposit, 'status' => PaymentStatus::Paid, 'amount' => $verse, 'paid_at' => now()]);
            if ($rendu > 0) {
                LeasePayment::factory()->create(['lease_id' => $bail->id, 'payer_id' => $bail->tenant_id, 'payment_type' => LeasePaymentType::DepositRefund, 'status' => PaymentStatus::Paid, 'amount' => $rendu, 'paid_at' => now()]);
            }
        }

        $this->assertSame(2, $this->compte('deposits')['count']);
        $this->assertSame(2, $this->lignesDuFichier('deposits', ''));
    }

    public function test_le_droit_de_l_export_s_applique_au_compte(): void
    {
        $this->actingAsApi($this->admin)->getJson('/api/export/widgets/count')->assertNotFound();

        // Le bailleur n'exporte pas les finances d'une agence : 403 AVANT la règle de `limit` (422).
        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $this->actingAsApi($bailleur)->getJson('/api/export/aging/count?limit=abc')->assertForbidden();

        $this->actingAsApi($this->admin)->getJson('/api/export/leases/count?limit=abc')->assertStatus(422);
    }
}
