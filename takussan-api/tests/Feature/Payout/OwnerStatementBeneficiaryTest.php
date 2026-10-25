<?php

namespace Tests\Feature\Payout;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-997 (P50.02, Q1 ; P232.07 et le reste de P232.05, porteur 2026-10-25) — une seule règle de
 * bénéficiaire. Pour un même bien, celui à qui le loyer se reverse est celui dont le relevé de
 * gérance se lit et à qui l'avis mensuel part : le bailleur (de tout statut, c'est son argent), ou
 * le personnel ACTIF de l'agence pour un bien qu'elle garde en propre. L'effacement d'un compte
 * compte la même agence débitrice (`agenciesOwingPayout`).
 */
class OwnerStatementBeneficiaryTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = $this->moneyAgency(['moderation_required' => false]);
        $this->agent = $this->agencyAgent($this->agency);
        $this->admin = $this->agencyAdmin($this->agency);
    }

    /** L'agent saisit un bien (au nom de `$ownerId`, ou de l'agence), puis un bail ; un loyer de septembre est payé. */
    private function loyerPaye(?int $ownerId): LeasePayment
    {
        $bien = $this->actingAsApi($this->agent)->postJson('/api/properties', array_filter([
            'title' => 'Appartement F3',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 300_000,
            'owner_id' => $ownerId,
        ]))->assertCreated()->json('data.id');
        $locataire = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id]);
        $bail = $this->actingAsApi($this->agent)->postJson('/api/leases', [
            'property_id' => $bien,
            'tenant_id' => $locataire->id,
            'type' => 'residential_rent',
            'start_date' => '2026-09-01',
            'end_date' => '2027-08-31',
            'monthly_rent' => 300_000,
        ])->assertCreated()->json('data.id');
        $lease = Lease::query()->findOrFail($bail);
        $lease->forceFill(['status' => LeaseStatus::Active, 'commission_rate' => 10])->save();

        return $this->leasePayment($lease, 300_000);
    }

    private function releve(User $lecteur, User $beneficiaire): TestResponse
    {
        return $this->actingAsApi($lecteur)
            ->getJson("/api/owner-statements?period=2026-09&landlord_id={$beneficiaire->id}&agency_id={$this->agency->id}");
    }

    private function reverser(User $beneficiaire, LeasePayment $loyer): TestResponse
    {
        return $this->actingAsApi($this->agencyAgent($this->agency))->postJson('/api/payouts', [
            'landlord_id' => $beneficiaire->id,
            'lease_payment_ids' => [$loyer->id],
        ]);
    }

    private function avisRecus(User $user): int
    {
        $this->artisan('payouts:send-owner-statements', ['--period' => '2026-09'])->assertSuccessful();

        return Notification::sent($user, CodedNotification::class)
            ->filter(fn (CodedNotification $n): bool => $n->code->value === 'owner_statement.available')
            ->count();
    }

    /** @return list<string> */
    private function obligations(User $user): array
    {
        return array_column(app(AccountDeletionService::class)->collectOpenObligations($user->fresh()), 'type');
    }

    public function test_ac5_le_bien_saisi_pour_b_se_reverse_a_b_qui_lit_son_releve_et_recoit_l_avis(): void
    {
        $b = User::factory()->withOwnerProfile($this->agency)->create();
        $loyer = $this->loyerPaye($b->id);

        $this->releve($this->admin, $b)->assertOk()->assertJsonPath('data.totals.gross', 300000);
        $this->assertSame(1, $this->avisRecus($b));
        $this->reverser($b, $loyer)->assertCreated();
    }

    public function test_ac8_le_bien_garde_par_l_agence_se_lit_et_s_avise_comme_il_se_reverse(): void
    {
        $loyer = $this->loyerPaye(null);

        $this->releve($this->admin, $this->agent)->assertOk()->assertJsonPath('data.totals.gross', 300000);
        $this->assertSame(1, $this->avisRecus($this->agent));
        $this->assertContains('payout_due', $this->obligations($this->agent));
        $this->reverser($this->agent, $loyer)->assertCreated();
    }

    public function test_ac8_ni_bailleur_ni_personnel_aucun_releve_aucun_avis_aucun_reversement(): void
    {
        $loyer = $this->loyerPaye(null);
        AgentProfile::query()->where('user_id', $this->agent->id)->delete();

        $this->releve($this->admin, $this->agent)->assertForbidden();
        $this->assertSame(0, $this->avisRecus($this->agent));
        $this->assertNotContains('payout_due', $this->obligations($this->agent));
        $this->reverser($this->agent, $loyer)->assertForbidden();
    }

    public function test_p232_07_le_personnel_suspendu_n_est_plus_beneficiaire(): void
    {
        $loyer = $this->loyerPaye(null);
        AgentProfile::query()->where('user_id', $this->agent->id)->update(['status' => 'suspended']);

        $this->reverser($this->agent, $loyer)->assertForbidden()->assertJsonPath('code', 'payout.landlord_not_in_agency');
        $this->actingAsApi($this->agencyAgent($this->agency))
            ->getJson("/api/payouts/preparation?landlord_id={$this->agent->id}&period_start=2026-09-01&period_end=2026-09-30")
            ->assertForbidden()
            ->assertJsonPath('code', 'payout.landlord_not_in_agency');
        $this->releve($this->admin, $this->agent)->assertForbidden();
        $this->assertSame(0, $this->avisRecus($this->agent));
        $this->assertNotContains('payout_due', $this->obligations($this->agent));
    }

    public function test_p232_07_le_bailleur_bloque_garde_son_argent(): void
    {
        $b = User::factory()->withOwnerProfile($this->agency)->create();
        $loyer = $this->loyerPaye($b->id);
        OwnerProfile::query()->where('user_id', $b->id)->update(['status' => 'blocked']);

        $this->releve($this->admin, $b)->assertOk();
        $this->assertSame(1, $this->avisRecus($b));
        $this->assertContains('payout_due', $this->obligations($b));
        $this->reverser($b, $loyer)->assertCreated();
    }

    public function test_un_bailleur_d_une_autre_agence_n_est_pas_beneficiaire_ici(): void
    {
        $ailleurs = User::factory()->withOwnerProfile($this->moneyAgency())->create();
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $ailleurs->id]);
        $lease = Lease::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->agency->id, 'landlord_id' => $ailleurs->id,
            'status' => LeaseStatus::Active, 'commission_rate' => 10,
        ]);
        $loyer = $this->leasePayment($lease, 300_000);

        $this->releve($this->admin, $ailleurs)->assertForbidden();
        $this->assertSame(0, $this->avisRecus($ailleurs));
        $this->reverser($ailleurs, $loyer)->assertForbidden();
    }
}
