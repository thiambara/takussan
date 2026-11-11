<?php

namespace Tests\Feature\Team;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\CommissionEntry;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-2665 — `GET /api/users` sert l'équipe de la console : `filter[role]` en liste (OU),
 * `include=team_summary` (biens suivis, commissions dues, absence en cours, arrivée dans l'agence)
 * et `meta.counts` sur l'ensemble filtré hors rôle.
 */
class TeamMembersSummaryTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-12 10:00:00'));
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
    }

    private function admin(): User
    {
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        // Le harnais peut poser un profil de bailleur de compatibilité : l'admin n'est ici qu'admin.
        OwnerProfile::query()->where('user_id', $admin->id)->forceDelete();

        return $admin;
    }

    private function member(string $profile, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $class = match ($profile) {
            'agent' => AgentProfile::class,
            'agency_admin' => AgencyAdminProfile::class,
            'owner' => OwnerProfile::class,
        };
        $class::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agency->id]);

        return $user;
    }

    private function absence(User $absent, User $substitute, string $from, string $to): void
    {
        RoleDelegation::factory()->create([
            'user_id' => $substitute->id, 'delegator_id' => $absent->id, 'agency_id' => $this->agency->id,
            'role' => RoleDelegation::ABSENCE_ROLE, 'replaces_user_id' => $absent->id,
            'starts_at' => Carbon::parse($from), 'ends_at' => Carbon::parse($to),
            'status' => RoleDelegationStatus::Active, 'activated_at' => Carbon::parse($from),
        ]);
    }

    /** @return array<string, mixed> */
    private function row(array $data, int $id): array
    {
        $row = collect($data)->firstWhere('id', $id);
        $this->assertNotNull($row, "le membre {$id} est absent de la liste");

        return $row;
    }

    public function test_ac1_la_liste_des_collaborateurs_et_les_comptes_sur_l_ensemble_hors_role(): void
    {
        $this->admin();
        $agents = collect(range(1, 9))->map(fn () => $this->member('agent'));
        $this->member('agency_admin');
        foreach (range(1, 11) as $i) {
            $this->member('owner');
        }
        $this->absence($agents[0], $agents[1], '2026-11-10 00:00', '2026-11-14 23:59');
        // Un membre d'une autre agence ne compte nulle part.
        AgentProfile::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => Agency::factory()->create()->id]);

        $response = $this->apiGet('/api/users?filter[role]=agent,agency_admin&per_page=5')->assertOk();

        $this->assertSame(11, $response->json('meta.total'));
        $this->assertCount(5, $response->json('data'));
        $this->assertSame(['agent' => 9, 'agency_admin' => 2, 'owner' => 11, 'absent' => 1], $response->json('meta.counts'));
    }

    public function test_un_seul_role_et_un_role_inconnu(): void
    {
        $this->admin();
        $this->member('agent');
        $this->member('owner');

        $this->apiGet('/api/users?filter[role]=owner')->assertOk()->assertJsonPath('meta.total', 1);
        $this->apiGet('/api/users?filter[role]=agent,inconnu')->assertOk()->assertJsonPath('meta.total', 1);
        $this->apiGet('/api/users?filter[role]=inconnu')->assertOk()->assertJsonPath('meta.total', 0);
    }

    public function test_les_comptes_suivent_les_autres_filtres(): void
    {
        $this->admin();
        $this->member('agent');
        $this->member('agent', ['status' => UserStatus::Blocked]);
        $this->member('owner', ['status' => UserStatus::Blocked]);

        $counts = $this->apiGet('/api/users?filter[role]=agent&filter[status]=blocked')->assertOk()->json('meta.counts');

        $this->assertSame(['agent' => 1, 'agency_admin' => 0, 'owner' => 1, 'absent' => 0], $counts);
    }

    public function test_le_resume_de_chaque_membre(): void
    {
        $admin = $this->admin();
        $agent = $this->member('agent');
        $substitute = $this->member('agent', ['first_name' => 'Fatou', 'last_name' => 'Ndiaye']);
        AgentProfile::query()->where('user_id', $agent->id)->update(['created_at' => Carbon::parse('2025-03-01 08:00:00')]);

        Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $agent->id]);
        Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $agent->id, 'status' => PropertyStatus::Sold]);
        Property::factory()->create(['agency_id' => Agency::factory()->create()->id, 'user_id' => $agent->id]);

        CommissionEntry::factory()->create(['agency_id' => $this->agency->id, 'beneficiary_id' => $agent->id, 'amount' => 30000, 'status' => CommissionEntryStatus::Due]);
        CommissionEntry::factory()->create(['agency_id' => $this->agency->id, 'beneficiary_id' => $agent->id, 'amount' => 12500.5, 'status' => CommissionEntryStatus::Due]);
        CommissionEntry::factory()->create(['agency_id' => $this->agency->id, 'beneficiary_id' => $agent->id, 'amount' => 99999, 'status' => CommissionEntryStatus::Paid, 'paid_at' => now()]);
        CommissionEntry::factory()->create(['agency_id' => Agency::factory()->create()->id, 'beneficiary_id' => $agent->id, 'amount' => 77777, 'status' => CommissionEntryStatus::Due]);

        $this->absence($agent, $substitute, '2026-11-10 00:00', '2026-11-14 23:59');

        $data = $this->apiGet('/api/users?filter[role]=agent,agency_admin&include=team_summary')->assertOk()->json('data');
        $row = $this->row($data, $agent->id);

        $this->assertSame(1, $row['properties_followed_count']);
        $this->assertEquals(42500.5, $row['commissions_due_amount']);
        $this->assertSame('2025-03-01T08:00:00+00:00', $row['joined_at']);
        $this->assertSame(['id' => $substitute->id, 'name' => 'Fatou Ndiaye'], $row['current_absence']['substitute']);
        $this->assertSame('2026-11-10T00:00:00+00:00', $row['current_absence']['starts_at']);
        $this->assertSame('2026-11-14T23:59:00+00:00', $row['current_absence']['ends_at']);

        $other = $this->row($data, $substitute->id);
        $this->assertSame(0, $other['properties_followed_count']);
        $this->assertEquals(0, $other['commissions_due_amount']);
        $this->assertNull($other['current_absence']);
        $this->assertArrayHasKey('joined_at', $this->row($data, $admin->id));
    }

    public function test_l_arrivee_d_un_agent_devenu_administrateur_est_celle_de_son_premier_profil(): void
    {
        $this->admin();
        $promoted = $this->member('agency_admin');
        AgencyAdminProfile::query()->where('user_id', $promoted->id)->update(['created_at' => Carbon::parse('2026-06-01 09:00:00')]);
        $agentProfile = AgentProfile::factory()->create(['user_id' => $promoted->id, 'agency_id' => $this->agency->id]);
        $agentProfile->forceFill(['created_at' => Carbon::parse('2024-02-01 09:00:00')])->save();
        $agentProfile->delete();
        // Un profil dans une autre agence, plus ancien encore, ne compte pas.
        AgentProfile::factory()->create(['user_id' => $promoted->id, 'agency_id' => Agency::factory()->create()->id, 'created_at' => Carbon::parse('2020-01-01')]);

        $row = $this->row($this->apiGet('/api/users?include=team_summary')->assertOk()->json('data'), $promoted->id);

        $this->assertSame('2024-02-01T09:00:00+00:00', $row['joined_at']);
    }

    public function test_sans_include_aucun_resume(): void
    {
        $this->admin();
        $agent = $this->member('agent');

        $row = $this->row($this->apiGet('/api/users?filter[role]=agent')->assertOk()->json('data'), $agent->id);

        $this->assertArrayNotHasKey('properties_followed_count', $row);
        $this->assertArrayNotHasKey('current_absence', $row);
    }

    public function test_ac3_l_absence_en_cours_se_termine_avec_sa_periode(): void
    {
        $this->admin();
        $agent = $this->member('agent');
        $substitute = $this->member('agent');
        $this->absence($agent, $substitute, '2026-11-10 00:00', '2026-11-14 23:59');

        $this->travelTo(Carbon::parse('2026-11-12 10:00:00'));
        $row = $this->row($this->apiGet('/api/users?include=team_summary')->assertOk()->json('data'), $agent->id);
        $this->assertSame($substitute->id, $row['current_absence']['substitute']['id']);

        $this->travelTo(Carbon::parse('2026-11-15 10:00:00'));
        $response = $this->apiGet('/api/users?include=team_summary')->assertOk();
        $this->assertNull($this->row($response->json('data'), $agent->id)['current_absence']);
        $this->assertSame(0, $response->json('meta.counts.absent'));
    }

    /** Un agent de l'agence dont le seul rôle porte exactement `$capabilities`. */
    private function reader(array $capabilities): User
    {
        $reader = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $reader->id, 'agency_id' => $this->agency->id]);
        $role = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities($capabilities)
            ->create(['agency_id' => $this->agency->id]);
        AgentProfile::query()->where('user_id', $reader->id)->update(['agency_role_id' => $role->id]);

        return $reader->fresh();
    }

    public function test_ac2_sans_payouts_approve_ni_reports_view_agency_la_cle_est_absente(): void
    {
        $agent = $this->member('agent');
        CommissionEntry::factory()->create(['agency_id' => $this->agency->id, 'beneficiary_id' => $agent->id, 'amount' => 30000]);

        $row = $this->row($this->actingAs($this->reader([Capability::TeamInvite]), 'sanctum')
            ->getJson('/api/users?include=team_summary')->assertOk()->json('data'), $agent->id);
        $this->assertArrayNotHasKey('commissions_due_amount', $row);
        $this->assertArrayHasKey('properties_followed_count', $row);
    }

    public function test_reports_view_agency_ou_payouts_approve_rendent_la_cle(): void
    {
        $agent = $this->member('agent');
        CommissionEntry::factory()->create(['agency_id' => $this->agency->id, 'beneficiary_id' => $agent->id, 'amount' => 30000]);

        foreach ([Capability::ReportsViewAgency, Capability::PayoutsApprove] as $capability) {
            $row = $this->row($this->actingAs($this->reader([Capability::TeamInvite, $capability]), 'sanctum')
                ->getJson('/api/users?include=team_summary')->assertOk()->json('data'), $agent->id);
            $this->assertEquals(30000, $row['commissions_due_amount'], $capability->value);
        }
    }

    public function test_le_resume_avec_fields_users(): void
    {
        $this->admin();
        $agent = $this->member('agent');

        $row = $this->row($this->apiGet('/api/users?fields[users]=id,first_name&include=team_summary')->assertOk()->json('data'), $agent->id);

        $this->assertSame(0, $row['properties_followed_count']);
        $this->assertArrayHasKey('joined_at', $row);
    }

    public function test_le_resume_coute_le_meme_nombre_de_requetes_pour_2_et_pour_12_membres(): void
    {
        $this->admin();
        $count = function (int $n): int {
            foreach (range(1, $n) as $i) {
                $agent = $this->member('agent');
                Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $agent->id]);
                CommissionEntry::factory()->create(['agency_id' => $this->agency->id, 'beneficiary_id' => $agent->id]);
            }
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->apiGet('/api/users?include=team_summary&per_page=50')->assertOk();
            $queries = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $queries;
        };

        $this->apiGet('/api/users?include=team_summary')->assertOk(); // amorce : caches de la première requête
        $two = $count(2);
        $twelve = $count(10);

        $this->assertSame($two, $twelve, "2 membres : {$two} requêtes ; 12 : {$twelve}");
    }
}
