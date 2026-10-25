<?php

namespace Tests\Feature\Commission;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2364 (P241.02 ; ADR-0049 « Ventilation » § 2, amendement du 2026-10-25) — le taux de commission
 * d'un agent (`agent_profiles.commission_rate`) s'écrit sur sa fiche de membre, sous `team.assign_role`
 * (`PATCH /api/profiles/{agent_profile}/commission-rate`).
 *
 * Avant : aucun chemin de l'API ne l'écrivait. La règle 2 de la ventilation (le négociateur reçoit son
 * taux) ne servait rien hors des tests, qui posent le taux par factory.
 */
class AgentCommissionRateTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $agent;

    private AgentProfile $profile;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = $this->agencyAgent($this->agency);
        $this->profile = AgentProfile::query()->where('user_id', $this->agent->id)->firstOrFail();
        $this->profile->update(['commission_rate' => null]);
    }

    private function url(?AgentProfile $profile = null): string
    {
        return '/api/profiles/'.($profile ?? $this->profile)->id.'/commission-rate';
    }

    /** La garde que demande la décision : le taux posé sur la fiche, la ligne `negotiator` naît. */
    public function test_the_rate_set_on_the_member_sheet_creates_the_negotiator_line_at_activation(): void
    {
        $this->actingAsApi($this->admin);
        $this->patchJson($this->url(), ['commission_rate' => 30])->assertOk()
            ->assertJsonPath('data.commission_rate', 30);

        $owner = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $owner->id, 'agency_id' => $this->agency->id]);
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $this->agency->id]);
        $tenant = Customer::factory()->create(['agency_id' => $this->agency->id]);

        $leaseId = $this->postJson('/api/leases', [
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'type' => 'residential_rent',
            'start_date' => now()->toDateString(),
            'monthly_rent' => 300000,
            'commission_amount' => 100000,
            'agent_id' => $this->agent->id,
        ])->assertCreated()->json('data.id');

        Storage::fake(config('media-library.disk_name'));
        $this->post("/api/leases/{$leaseId}/activate", ['contract' => UploadedFile::fake()->create('bail.pdf', 120, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertOk();

        $line = CommissionEntry::query()->where('lease_id', $leaseId)->sole();
        $this->assertSame($this->agent->id, $line->beneficiary_id);
        $this->assertSame('negotiator', $line->origin->value);
        $this->assertEquals(30.0, (float) $line->share_percent);
        $this->assertEquals(30000.0, (float) $line->amount);
    }

    public function test_the_rate_can_be_cleared(): void
    {
        $this->profile->update(['commission_rate' => 12]);

        $this->actingAsApi($this->admin);
        $this->patchJson($this->url(), ['commission_rate' => null])->assertOk()
            ->assertJsonPath('data.commission_rate', null);

        $this->assertNull($this->profile->fresh()->commission_rate);
    }

    public function test_the_rate_is_a_percentage(): void
    {
        $this->actingAsApi($this->admin);
        $this->patchJson($this->url(), ['commission_rate' => 150])->assertUnprocessable()
            ->assertJsonValidationErrors('commission_rate');
        $this->patchJson($this->url(), ['commission_rate' => -1])->assertUnprocessable()
            ->assertJsonValidationErrors('commission_rate');
        $this->patchJson($this->url(), [])->assertUnprocessable()
            ->assertJsonValidationErrors('commission_rate');

        $this->assertNull($this->profile->fresh()->commission_rate);
    }

    /** L'agent ne fixe pas son propre taux, ni un collègue : il ne tient pas `team.assign_role`. */
    public function test_an_agent_cannot_set_a_rate(): void
    {
        $this->actingAsApi($this->agent);
        $this->patchJson($this->url(), ['commission_rate' => 50])->assertForbidden();

        $this->actingAsApi($this->agencyAgent($this->agency));
        $this->patchJson($this->url(), ['commission_rate' => 50])->assertForbidden();

        $this->assertNull($this->profile->fresh()->commission_rate);
    }

    public function test_the_landlord_cannot_set_a_rate(): void
    {
        $owner = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $owner->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($owner);
        $this->patchJson($this->url(), ['commission_rate' => 50])->assertForbidden();

        $this->assertNull($this->profile->fresh()->commission_rate);
    }

    public function test_an_admin_without_team_assign_role_cannot_set_a_rate(): void
    {
        $this->actingAsApi($this->adminWithout($this->agency, Capability::TeamAssignRole));
        $this->patchJson($this->url(), ['commission_rate' => 50])->assertForbidden();

        $this->assertNull($this->profile->fresh()->commission_rate);
    }

    public function test_the_admin_of_another_agency_cannot_set_a_rate(): void
    {
        $this->actingAsApi($this->agencyAdmin(Agency::factory()->create()));
        $this->patchJson($this->url(), ['commission_rate' => 50])->assertForbidden();

        $this->assertNull($this->profile->fresh()->commission_rate);
    }

    /** La fiche lit le taux là où elle lit le rôle : les affectations de la liste des membres. */
    public function test_the_member_list_returns_the_rate_with_the_agent_assignment(): void
    {
        $this->profile->update(['commission_rate' => 12.5]);

        $this->actingAsApi($this->admin);
        $rows = collect($this->getJson('/api/users?with_role_assignments=1&per_page=50')->assertOk()->json('meta.role_assignments'));

        $row = $rows->firstWhere('profile_id', $this->profile->id);
        $this->assertNotNull($row);
        $this->assertSame('agent', $row['profile_type']);
        $this->assertEquals(12.5, $row['commission_rate']);
        $this->assertArrayNotHasKey('commission_rate', $rows->firstWhere('profile_type', 'agency_admin') ?? []);
    }
}
