<?php

namespace Tests\Feature\Commission;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Enums\Capability;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2661 — l'agent exporte ses commissions sans `reports.export`, et elles seules ; qui tient
 * `reports.export` garde l'export du périmètre du relevé.
 */
class CommissionExportBeneficiaryTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
    }

    private function line(User $beneficiary, string $reference, ?Agency $agency = null): void
    {
        $agency ??= $this->agency;
        CommissionEntry::factory()->create([
            'agency_id' => $agency->id,
            'lease_id' => Lease::factory()->create(['agency_id' => $agency->id, 'reference_number' => $reference])->id,
            'beneficiary_id' => $beneficiary->id,
        ]);
    }

    private function export(User $as): string
    {
        return $this->actingAsApi($as)->getJson('/api/export/commissions?format=csv')->assertOk()->streamedContent();
    }

    public function test_ac7_the_agent_exports_his_lines_and_no_other(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $this->assertFalse($agent->canActAt(Capability::ReportsExport, $this->agency), 'prémisse : l\'agent n\'a pas reports.export');
        $this->line($agent, 'LEASE-MINE');
        $this->line($this->agencyAgent($this->agency), 'LEASE-COLLEAGUE');
        $other = Agency::factory()->create();
        $this->line($this->agencyAgent($other), 'LEASE-ELSEWHERE', $other);

        $body = $this->export($agent);

        $this->assertStringContainsString('LEASE-MINE', $body);
        $this->assertStringNotContainsString('LEASE-COLLEAGUE', $body);
        $this->assertStringNotContainsString('LEASE-ELSEWHERE', $body);
    }

    /**
     * Sans `reports.export`, même qui lit toute l'agence au relevé n'exporte que SES lignes : l'export
     * ouvert au bénéficiaire n'ouvre pas celles des autres.
     */
    public function test_without_reports_export_an_admin_exports_only_his_own_lines(): void
    {
        $admin = $this->adminWithout($this->agency, Capability::ReportsExport);
        $this->line($admin, 'LEASE-ADMIN');
        $this->line($this->agencyAgent($this->agency), 'LEASE-AGENT');

        $body = $this->export($admin);

        $this->assertStringContainsString('LEASE-ADMIN', $body);
        $this->assertStringNotContainsString('LEASE-AGENT', $body);
    }

    public function test_with_reports_export_the_admin_still_exports_the_whole_agency(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $this->line($this->agencyAgent($this->agency), 'LEASE-AGENT');

        $this->assertStringContainsString('LEASE-AGENT', $this->export($admin));
    }

    /** L'ouverture ne vaut que pour les commissions : les autres exports financiers restent fermés. */
    public function test_the_agent_still_cannot_export_the_payouts(): void
    {
        $this->actingAsApi($this->agencyAgent($this->agency))
            ->getJson('/api/export/payouts?format=csv')
            ->assertForbidden()
            ->assertJsonPath('code', 'export.forbidden');
    }
}
