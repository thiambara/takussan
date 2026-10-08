<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-595 — AC17 bis : les chiffres consolidés d'une agence s'ouvrent par `reports.view_agency`
 * (ADR-0049 §4), et l'effectif « Équipe » compte le personnel actif, jamais les bailleurs.
 *
 * Le code d'origine admettait `isAgentAt` : un agent lisait par appel direct le chiffre d'affaires,
 * les impayés et les commissions de toute l'agence.
 */
class DashboardAgencyAccessTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function consolidatedEndpoints(): array
    {
        return [
            'tableau de bord d’agence' => ['/api/dashboard/agency'],
            'statistiques d’agence' => ['/api/agencies/{agency}/stats'],
        ];
    }

    private function url(string $pattern, Agency $agency): string
    {
        return str_replace('{agency}', (string) $agency->id, $pattern);
    }

    #[DataProvider('consolidatedEndpoints')]
    public function test_an_agent_of_the_agency_is_refused(string $endpoint): void
    {
        $agency = Agency::factory()->create();

        $this->actingAsApi($this->agencyAgent($agency))
            ->getJson($this->url($endpoint, $agency))
            ->assertForbidden();
    }

    #[DataProvider('consolidatedEndpoints')]
    public function test_the_system_agency_admin_reads_it_without_any_capability_added_by_hand(string $endpoint): void
    {
        $agency = Agency::factory()->create();

        $this->actingAsApi($this->agencyAdmin($agency))
            ->getJson($this->url($endpoint, $agency))
            ->assertOk();
    }

    #[DataProvider('consolidatedEndpoints')]
    public function test_a_custom_role_carrying_reports_view_agency_opens_it(string $endpoint): void
    {
        $agency = Agency::factory()->create();

        $this->actingAsApi($this->agentWith($agency, Capability::ReportsViewAgency))
            ->getJson($this->url($endpoint, $agency))
            ->assertOk();
    }

    #[DataProvider('consolidatedEndpoints')]
    public function test_the_admin_of_another_agency_is_refused(string $endpoint): void
    {
        $agency = Agency::factory()->create();
        $this->agencyAdmin($agency);
        $other = Agency::factory()->create();

        $this->actingAsApi($this->agencyAdmin($other))
            ->getJson($this->url($endpoint, $agency).(str_contains($endpoint, '{agency}') ? '' : '?agency_id='.$agency->id))
            ->assertForbidden();
    }

    public function test_members_count_is_active_staff_and_never_landlords(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->agencyAdmin($agency);
        $this->agencyAgent($agency);
        $this->agencyAgent($agency);
        AgentProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Inactive,
        ]);
        foreach (range(1, 3) as $_) {
            OwnerProfile::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $agency->id]);
        }

        $this->actingAsApi($admin);

        $this->assertSame(3, $this->getJson('/api/dashboard/agency')->assertOk()->json('data.members_count'));
        $this->assertSame(3, $this->getJson("/api/agencies/{$agency->id}/stats")->assertOk()->json('data.members_count'));
    }

    /**
     * verif-595 m1 — la clause de profil actif de `viewReports` (contrat TCK-146) : admin de A et agent
     * de B, sous son profil d'agent de B, il ne lit pas les chiffres consolidés de A. `canActAt` seul
     * le laisserait passer.
     */
    public function test_m1_an_admin_of_a_under_his_agent_profile_of_b_is_refused_on_a(): void
    {
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $user = $this->agencyAdmin($a);
        $adminProfile = AgencyAdminProfile::query()->where('user_id', $user->id)->firstOrFail();
        $agentProfile = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);
        $this->actingAsApi($user);

        foreach (["/api/dashboard/agency?agency_id={$a->id}", "/api/agencies/{$a->id}/stats", "/api/agencies/{$a->id}/finance/aging"] as $url) {
            $this->withHeaders(['X-Profile-Id' => "agent:{$agentProfile->id}"])->getJson($url)->assertForbidden();
            $this->withHeaders(['X-Profile-Id' => "agency_admin:{$adminProfile->id}"])->getJson($url)->assertOk();
        }
    }

    /**
     * verif-595 M1 — `/dashboard/me` ne rend les chiffres consolidés (chiffre d'affaires, commissions,
     * impayés) que sous `viewReports`, comme `/dashboard/agency`. Le rôle d'admin moins
     * `reports.view_agency` les lisait par ce second chemin.
     */
    public function test_m1_dashboard_me_hides_consolidated_figures_without_view_agency(): void
    {
        $agency = Agency::factory()->create();

        $this->actingAsApi($this->adminWithout($agency, Capability::ReportsViewAgency));
        $this->getJson('/api/dashboard/agency')->assertForbidden();
        $data = $this->getJson('/api/dashboard/me')->assertOk()->assertJsonPath('data.role', 'agency_admin')->json('data');
        foreach (['revenue_month', 'commission_month', 'overdue_count', 'overdue_amount', 'unpaid_rate_percent'] as $key) {
            $this->assertArrayNotHasKey($key, $data['metrics'], $key);
        }
        $this->assertArrayHasKey('properties_total', $data['metrics']);

        $this->actingAsApi($this->agencyAdmin($agency));
        $this->assertArrayHasKey('revenue_month', $this->getJson('/api/dashboard/me')->assertOk()->json('data.metrics'));
    }
}
