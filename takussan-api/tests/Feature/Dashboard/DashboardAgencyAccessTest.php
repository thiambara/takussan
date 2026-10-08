<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
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
}
