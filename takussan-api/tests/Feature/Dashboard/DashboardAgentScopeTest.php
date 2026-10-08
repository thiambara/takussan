<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-595 — AC12 : « mes chiffres » sont ceux de l'agent, et ceux de l'agence s'ouvrent par
 * `reports.view_agency` (ADR-0049 §4).
 *
 * L'agence compte 5 biens : P1 et P2 dont A est `user_id`, P3 dont il est collaborateur `agent`
 * (ajouté par la route, `accepted_at` nul), P4 (le bail d'AC9) et P5 (le bail d'un autre agent).
 */
class DashboardAgentScopeTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $a;

    private User $b;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-07-15 10:00:00');

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->a = $this->agentAtRate(30);
        $this->b = $this->agentAtRate(0);
        $c = $this->agentAtRate(0);
        $other = $this->agentAtRate(0);
        $owner = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $owner->id, 'agency_id' => $this->agency->id]);
        $tenant = Customer::factory()->create(['agency_id' => $this->agency->id]);

        $p = fn (User $who) => Property::factory()->create(['user_id' => $who->id, 'agency_id' => $this->agency->id]);
        $p1 = $p($this->a);
        $p($this->a);
        $p3 = $p($owner);
        $p4 = $p($owner);
        $p5 = $p($owner);

        $this->collaborate($p3, $this->a, 0);
        $this->collaborate($p4, $this->b, 20);
        $this->collaborate($p4, $c, 10);
        AgentProfile::query()->where('user_id', $c->id)->firstOrFail()->delete();

        $this->signedLease($p4, $tenant, $this->a, 300_000);
        $this->signedLease($p5, $tenant, $other, 500_000);

        Booking::factory()->create(['property_id' => $p1->id, 'status' => BookingStatus::Pending]);
        Booking::factory()->create(['property_id' => $p4->id, 'status' => BookingStatus::Pending]);
        Booking::factory()->create(['property_id' => $p5->id, 'status' => BookingStatus::Pending]);

        foreach ([$this->a, $other, null] as $negotiator) {
            Lease::factory()->create([
                'property_id' => $p5->id,
                'agency_id' => $this->agency->id,
                'tenant_id' => $tenant->id,
                'status' => LeaseStatus::PendingSignature,
                'agent_id' => $negotiator?->id,
            ]);
        }
    }

    private function agentAtRate(float $rate): User
    {
        $agent = $this->agencyAgent($this->agency);
        AgentProfile::query()->where('user_id', $agent->id)->update(['commission_rate' => $rate]);

        return $agent;
    }

    private function collaborate(Property $property, User $user, float $share): void
    {
        $this->actingAsApi($this->admin);
        $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $user->id,
            'role' => 'agent',
            'commission_share' => $share,
        ])->assertCreated();
    }

    private function signedLease(Property $property, Customer $tenant, User $negotiator, float $commission): void
    {
        $this->actingAsApi($this->admin);
        $id = $this->postJson('/api/leases', [
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'type' => 'residential_rent',
            'start_date' => '2026-07-15',
            'monthly_rent' => 300000,
            'commission_amount' => $commission,
            'agent_id' => $negotiator->id,
        ])->assertCreated()->json('data.id');
        // TCK-596 (ADR-0042 §6) — la voie papier exige le contrat numérisé.
        Storage::fake(config('media-library.disk_name'));
        $this->post("/api/leases/{$id}/activate", ['contract' => UploadedFile::fake()->create('bail.pdf', 120, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertOk();
    }

    public function test_ac12_the_negotiator_reads_his_own_figures(): void
    {
        $this->actingAsApi($this->a);

        $data = $this->getJson('/api/dashboard/agent')->assertOk()->json('data');

        $this->assertSame('mine', $data['scope']);
        $this->assertEquals(90000.0, $data['finance']['commissions_month']);
        $this->assertSame(3, $data['properties_managed']);
        $this->assertSame(1, $data['bookings']['pending']);
        $this->assertSame(1, $data['pipeline_ops']['leases_to_sign']);
    }

    public function test_ac12_a_collaborator_reads_his_share(): void
    {
        $this->actingAsApi($this->b);

        $this->assertEquals(60000.0, $this->getJson('/api/dashboard/agent')->assertOk()->json('data.finance.commissions_month'));
    }

    public function test_ac12_the_agency_scope_is_refused_to_an_agent(): void
    {
        $this->actingAsApi($this->a);

        $this->getJson('/api/dashboard/agent?scope=agency')->assertForbidden();
    }

    public function test_ac12_the_agency_scope_opens_to_the_system_agency_admin(): void
    {
        $this->actingAsApi($this->admin);

        $data = $this->getJson('/api/dashboard/agent?scope=agency')->assertOk()->json('data');

        $this->assertSame('agency', $data['scope']);
        $this->assertSame(5, $data['properties_managed']);
        $this->assertSame(3, $data['bookings']['pending']);
        $this->assertSame(3, $data['pipeline_ops']['leases_to_sign']);
        $this->assertEquals(800000.0, $data['finance']['commissions_month']);
    }

    public function test_the_timeseries_reads_the_ledger_for_mine_and_the_leases_for_the_agency(): void
    {
        $this->actingAsApi($this->a);
        $mine = $this->getJson('/api/dashboard/agent?include=timeseries&months=2')->assertOk()->json('timeseries');
        $this->assertSame(['2026-06', '2026-07'], $mine['months']);
        $this->assertEquals([0.0, 90000.0], $mine['commissions']);
        $this->assertSame([0, 1], $mine['signed_leases']);

        $this->actingAsApi($this->admin);
        $agency = $this->getJson('/api/dashboard/agent?scope=agency&include=timeseries&months=2')->assertOk()->json('timeseries');
        $this->assertEquals([0.0, 800000.0], $agency['commissions']);
        $this->assertSame([0, 2], $agency['signed_leases']);
    }

    public function test_an_unknown_scope_is_rejected(): void
    {
        $this->actingAsApi($this->a);

        $this->getJson('/api/dashboard/agent?scope=team')->assertStatus(422)->assertJsonPath('code', 'dashboard.invalid_scope');
    }
}
