<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Owners\OwnerDirectory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;

/**
 * Vérification adverse de TCK-2641 (d1) — la fiche d'un bailleur (`GET /api/owners/{id}`, et la
 * réponse de son `PATCH`) suit la règle d'argent de la liste et du relevé
 * ({@see OwnerDirectory::readsMoney()}) : l'admin d'agence à rôle restreint, sans
 * `payouts.create`, à qui le relevé répond 403 et la liste ne sert aucun montant, ne lit ni les chiffres
 * du mois, ni le dernier ni le prochain versement par la fiche.
 */
class OwnerDetailMoneyTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    private Agency $agency;

    private OwnerProfile $profile;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-09-20 10:00:00');

        $this->agency = $this->moneyAgency();
        $this->landlord = $this->landlordOf($this->agency);
        $this->septemberOf($this->leaseOf($this->agency, $this->landlord, 10));
        Payout::factory()->create([
            'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id, 'payee_role' => PayeeRole::Landlord,
            'status' => PayoutStatus::Completed, 'processed_at' => '2026-09-15 09:00:00', 'net_amount' => 50_000,
        ]);
        $this->profile = OwnerProfile::query()->where('user_id', $this->landlord->id)->where('agency_id', $this->agency->id)->firstOrFail();
    }

    private function adminSansReversements(): User
    {
        $role = AgencyRole::factory()->ofType(AgencyRoleBaseType::AgencyAdmin)
            ->withCapabilities([Capability::CrmViewAll, Capability::TeamInvite, Capability::OwnersUpdate])
            ->create(['agency_id' => $this->agency->id]);
        $admin = User::factory()->withTwoFactor()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $this->agency->id, 'agency_role_id' => $role->id]);
        $admin = $admin->fresh();
        $this->assertFalse($admin->canActAt(Capability::PayoutsCreate, $this->agency));

        return $admin;
    }

    /** @param  array<string, mixed>  $data */
    private function assertSansArgent(array $data): void
    {
        $this->assertSame($this->profile->id, $data['id'], 'la fiche est servie');
        $this->assertSame(1, $data['properties_count']);
        $this->assertArrayHasKey('figures', $data);
        $this->assertNull($data['figures']);
        $this->assertNull($data['last_payout']);
        $this->assertNull($data['next_payout']);
    }

    public function test_l_admin_sans_payouts_create_ne_lit_pas_l_argent_par_la_fiche(): void
    {
        $admin = $this->adminSansReversements();
        Sanctum::actingAs($admin);

        // La règle qu'il faut suivre : le relevé lui est refusé.
        $this->getJson("/api/owner-statements?period=2026-09&landlord_id={$this->landlord->id}")->assertForbidden();

        $this->assertSansArgent($this->getJson("/api/owners/{$this->profile->id}")->assertOk()->json('data'));
        $this->assertSansArgent($this->getJson("/api/owners/{$this->profile->id}?period=2026-09")->assertOk()->json('data'));
    }

    public function test_la_reponse_du_patch_ne_sert_pas_l_argent_non_plus(): void
    {
        Sanctum::actingAs($this->adminSansReversements());

        $data = $this->patchJson("/api/owners/{$this->profile->id}", ['works_approval_threshold' => 90000])->assertOk()->json('data');

        $this->assertSansArgent($data);
        $this->assertEquals(90000, $data['works_approval_threshold']);
    }

    public function test_l_admin_qui_tient_le_releve_lit_toujours_l_argent(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        $data = $this->apiGet("/api/owners/{$this->profile->id}")->assertOk()->json('data');

        $this->assertEquals(198000 - 50000, $data['figures']['remaining_to_pay']);
        $this->assertEquals(50000, $data['last_payout']['net_amount']);
    }
}
