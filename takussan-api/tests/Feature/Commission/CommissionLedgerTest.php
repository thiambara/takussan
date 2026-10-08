<?php

namespace Tests\Feature\Commission;

use App\Events\Lease\LeaseActivated;
use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\CommissionOrigin;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-595 — AC9, AC9 bis, AC10, AC11 et AC14 : le grand livre naît à l'activation (ADR-0049 §3).
 *
 * Les collaborateurs sont TOUS ajoutés par la route réelle, jamais par factory : la route n'écrit
 * pas `accepted_at`, et une règle qui l'exigerait passerait un test qui le pose à la main.
 */
class CommissionLedgerTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private Property $property;

    private Customer $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-07-15 10:00:00');

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $owner = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $owner->id, 'agency_id' => $this->agency->id]);
        $this->property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $this->agency->id]);
        $this->tenant = Customer::factory()->create(['agency_id' => $this->agency->id]);
    }

    private function agentAtRate(float $rate): User
    {
        $agent = $this->agencyAgent($this->agency);
        AgentProfile::query()->where('user_id', $agent->id)->update(['commission_rate' => $rate]);

        return $agent;
    }

    private function addCollaborator(User $user, float $share): void
    {
        $this->actingAsApi($this->admin);
        $this->postJson("/api/properties/{$this->property->id}/collaborators", [
            'user_id' => $user->id,
            'role' => 'agent',
            'commission_share' => $share,
        ])->assertCreated();
    }

    /** @param  array<string, mixed>  $extra */
    private function createLease(array $extra = []): Lease
    {
        $this->actingAsApi($this->admin);
        $id = $this->postJson('/api/leases', $extra + [
            'property_id' => $this->property->id,
            'tenant_id' => $this->tenant->id,
            'type' => 'residential_rent',
            'start_date' => '2026-07-15',
            'end_date' => '2027-07-14',
            'monthly_rent' => 300000,
        ])->assertCreated()->json('data.id');

        return Lease::query()->findOrFail($id);
    }

    private function activate(Lease $lease): void
    {
        $this->actingAsApi($this->admin);
        // TCK-596 (ADR-0042 §6) — la voie papier exige le contrat numérisé.
        Storage::fake(config('media-library.disk_name'));
        $this->post("/api/leases/{$lease->id}/activate", ['contract' => UploadedFile::fake()->create('bail.pdf', 120, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertOk();
    }

    /** @return array<int, array{origin: string, amount: float, status: string}> */
    private function entries(Lease $lease): array
    {
        return CommissionEntry::query()->where('lease_id', $lease->id)->get()
            ->mapWithKeys(fn (CommissionEntry $e) => [$e->beneficiary_id => [
                'origin' => $e->origin->value,
                'amount' => (float) $e->amount,
                'status' => $e->status->value,
            ]])->all();
    }

    /** @return array{0: User, 1: User, 2: User, 3: Lease} */
    private function scenarioAc9(): array
    {
        $a = $this->agentAtRate(30);
        $b = $this->agencyAgent($this->agency);
        $c = $this->agencyAgent($this->agency);
        $this->addCollaborator($b, 20);
        $this->addCollaborator($c, 10);

        // C quitte l'agence entre son ajout et l'activation.
        AgentProfile::query()->where('user_id', $c->id)->firstOrFail()->delete();

        $lease = $this->createLease(['commission_amount' => 300000, 'agent_id' => $a->id]);

        return [$a, $b, $c, $lease];
    }

    public function test_ac9_activation_splits_the_commission_between_negotiator_and_eligible_collaborators(): void
    {
        $a = $this->agentAtRate(30);
        $b = $this->agencyAgent($this->agency);
        $c = $this->agencyAgent($this->agency);
        $this->addCollaborator($b, 20);
        $this->addCollaborator($c, 10);
        $this->assertSame(
            [null, null],
            PropertyCollaborator::query()->where('property_id', $this->property->id)->orderBy('id')->pluck('accepted_at')->all(),
        );
        AgentProfile::query()->where('user_id', $c->id)->firstOrFail()->delete();

        $this->actingAsApi($this->admin);
        $response = $this->postJson('/api/leases', [
            'property_id' => $this->property->id,
            'tenant_id' => $this->tenant->id,
            'type' => 'residential_rent',
            'start_date' => '2026-07-15',
            'end_date' => '2027-07-14',
            'monthly_rent' => 300000,
            'commission_amount' => 300000,
            'agent_id' => $a->id,
        ])->assertCreated();
        $this->assertEquals(300000.0, $response->json('data.commission_amount'));
        $this->assertSame($a->id, $response->json('data.agent_id'));
        $lease = Lease::query()->findOrFail($response->json('data.id'));

        $this->activate($lease);

        $this->assertEquals([
            $a->id => ['origin' => 'negotiator', 'amount' => 90000.0, 'status' => 'due'],
            $b->id => ['origin' => 'collaborator', 'amount' => 60000.0, 'status' => 'due'],
        ], $this->entries($lease));
    }

    public function test_ac9_a_second_activation_event_adds_nothing_and_termination_keeps_the_lines_due(): void
    {
        [, , , $lease] = $this->scenarioAc9();
        $this->activate($lease);
        $before = $this->entries($lease);
        $this->assertCount(2, $before);

        LeaseActivated::dispatch($lease->fresh());
        $this->assertSame(2, CommissionEntry::query()->count());

        $this->actingAsApi($this->admin);
        $this->postJson("/api/leases/{$lease->id}/terminate", ['reason' => 'départ'])->assertOk();

        $this->assertEquals($before, $this->entries($lease));
    }

    public function test_ac9_renewal_creates_no_line_and_the_child_keeps_the_negotiator(): void
    {
        [$a, , , $lease] = $this->scenarioAc9();
        $this->activate($lease);

        $this->actingAsApi($this->admin);
        $childId = $this->postJson("/api/leases/{$lease->id}/renew", [
            'start_date' => '2027-07-15',
            'end_date' => '2028-07-14',
        ])->assertCreated()->json('data.id');

        $this->assertSame($a->id, Lease::query()->findOrFail($childId)->agent_id);
        $this->assertSame(0, CommissionEntry::query()->where('lease_id', $childId)->count());
        $this->assertSame(2, CommissionEntry::query()->count());
    }

    /**
     * TCK-596 — un renouvellement né `pending_signature` émet `LeaseActivated` à sa signature. Même
     * porteur d'un montant et d'un négociateur, il ne crée aucune ligne (ADR-0049 §3).
     */
    public function test_ac9_a_renewal_activated_later_creates_no_line(): void
    {
        [$a, , , $lease] = $this->scenarioAc9();
        $this->activate($lease);

        $child = Lease::factory()->create([
            'property_id' => $lease->property_id,
            'landlord_id' => $lease->landlord_id,
            'tenant_id' => $lease->tenant_id,
            'agency_id' => $lease->agency_id,
            'renewed_from_lease_id' => $lease->id,
            'agent_id' => $a->id,
            'commission_amount' => 300000,
        ]);
        LeaseActivated::dispatch($child);

        $this->assertSame(0, CommissionEntry::query()->where('lease_id', $child->id)->count());
    }

    public function test_ac9_bis_the_agency_tile_reads_the_commission_of_a_lease_created_through_the_api(): void
    {
        [, , , $lease] = $this->scenarioAc9();
        $this->activate($lease);

        $this->actingAsApi($this->admin);
        $this->assertSame(300000.0, (float) $this->getJson('/api/dashboard/agency')->assertOk()->json('data.finance.commission_month'));
    }

    public function test_ac10_the_negotiator_share_is_capped_by_the_collaborators_served(): void
    {
        $a = $this->agentAtRate(30);
        $b = $this->agencyAgent($this->agency);
        $d = $this->agencyAgent($this->agency);
        $this->addCollaborator($b, 50);
        $this->addCollaborator($d, 30);
        $lease = $this->createLease(['commission_amount' => 300000, 'agent_id' => $a->id]);

        $this->activate($lease);

        $entries = $this->entries($lease);
        $this->assertEquals(60000.0, $entries[$a->id]['amount']);
        $this->assertEquals(20.0, (float) CommissionEntry::query()->where('beneficiary_id', $a->id)->value('share_percent'));
        $this->assertLessThanOrEqual(300000.0, array_sum(array_column($entries, 'amount')));
        $this->assertEquals(300000.0, array_sum(array_column($entries, 'amount')));
    }

    public function test_a_negotiator_who_is_also_a_collaborator_has_a_single_line(): void
    {
        $a = $this->agentAtRate(30);
        $b = $this->agencyAgent($this->agency);
        $this->addCollaborator($a, 20);
        $this->addCollaborator($b, 10);
        $lease = $this->createLease(['commission_amount' => 100000, 'agent_id' => $a->id]);

        $this->activate($lease);

        $line = CommissionEntry::query()->where('beneficiary_id', $a->id)->sole();
        $this->assertSame(CommissionOrigin::Negotiator, $line->origin);
        $this->assertEquals(50.0, (float) $line->share_percent);
        $this->assertEquals(50000.0, (float) $line->amount);
        $this->assertEquals(['collaborator_share' => 20, 'negotiator_rate' => 30, 'negotiator_share' => 30], $line->metadata);
    }

    public function test_no_line_without_a_positive_commission(): void
    {
        $a = $this->agentAtRate(30);
        $lease = $this->createLease(['agent_id' => $a->id]);

        $this->activate($lease);

        $this->assertSame(0, CommissionEntry::query()->count());
    }

    public function test_ac11_a_sale_without_amount_is_created_with_price_times_rate(): void
    {
        $lease = $this->createLease([
            'type' => 'sale',
            'monthly_rent' => null,
            'sale_price' => 50_000_000,
            'commission_rate' => 3,
        ]);

        $this->assertSame('1500000.00', $lease->commission_amount);
    }

    public function test_a_rental_rate_is_never_turned_into_a_commission_amount(): void
    {
        $lease = $this->createLease(['commission_rate' => 8]);

        $this->assertNull($lease->commission_amount);
    }

    public function test_the_negotiator_defaults_to_the_staff_creator_and_never_to_a_landlord(): void
    {
        $this->assertSame($this->admin->id, $this->createLease()->agent_id);

        $landlord = User::factory()->create();
        $own = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => null]);
        $tenant = Customer::factory()->create(['added_by_id' => $landlord->id]);
        $this->actingAsApi($landlord);
        $id = $this->postJson('/api/leases', [
            'property_id' => $own->id,
            'tenant_id' => $tenant->id,
            'type' => 'residential_rent',
            'start_date' => '2026-07-15',
            'monthly_rent' => 100000,
        ])->assertCreated()->json('data.id');

        $this->assertNull(Lease::query()->findOrFail($id)->agent_id);
    }

    public function test_ac14_the_negotiator_must_be_staff_of_the_property_agency(): void
    {
        $landlord = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);
        $client = User::factory()->create();
        Customer::factory()->create(['user_id' => $client->id, 'agency_id' => $this->agency->id]);
        $foreignAgent = $this->agencyAgent(Agency::factory()->create());

        $this->actingAsApi($this->admin);
        foreach ([$landlord, $client, $foreignAgent] as $candidate) {
            $this->postJson('/api/leases', [
                'property_id' => $this->property->id,
                'tenant_id' => $this->tenant->id,
                'type' => 'residential_rent',
                'start_date' => '2026-07-15',
                'monthly_rent' => 100000,
                'agent_id' => $candidate->id,
            ])->assertStatus(422)->assertJsonValidationErrors(['agent_id']);
        }

        $lease = Lease::factory()->create(['property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'tenant_id' => $this->tenant->id]);
        $this->patchJson("/api/leases/{$lease->id}", ['agent_id' => $foreignAgent->id])
            ->assertStatus(422)->assertJsonValidationErrors(['agent_id']);
        $this->assertSame(0, Lease::query()->whereNotNull('agent_id')->count());
    }

    public function test_entries_are_due_and_dated_at_signature(): void
    {
        [$a, , , $lease] = $this->scenarioAc9();
        $this->activate($lease);

        $line = CommissionEntry::query()->where('beneficiary_id', $a->id)->sole();
        $this->assertSame(CommissionEntryStatus::Due, $line->status);
        $this->assertSame('2026-07-15 10:00:00', $line->earned_at->format('Y-m-d H:i:s'));
        $this->assertSame($this->agency->id, $line->agency_id);
    }

    private function landlord(): User
    {
        return User::query()->findOrFail($this->property->user_id);
    }

    /** Un client que le bailleur a lui-même ajouté : il peut ouvrir un bail à son nom. */
    private function landlordsTenant(): Customer
    {
        return Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->property->user_id]);
    }

    /**
     * verif-595 B1 — le bailleur, débiteur de la commission, ne réécrit ni la base ni le négociateur
     * (il ramenait la base de 300 000 à 1 avant l'activation) ; le grand livre reste juste.
     */
    public function test_b1_the_landlord_cannot_set_the_commission_terms(): void
    {
        [$a, , , $lease] = $this->scenarioAc9();

        $this->actingAsApi($this->landlord());
        $this->patchJson("/api/leases/{$lease->id}", ['commission_amount' => 1])
            ->assertForbidden()->assertJsonPath('code', 'lease.commission_forbidden');
        $this->patchJson("/api/leases/{$lease->id}", ['agent_id' => null])
            ->assertForbidden()->assertJsonPath('code', 'lease.commission_forbidden');
        $this->postJson('/api/leases', [
            'property_id' => $this->property->id,
            'tenant_id' => $this->landlordsTenant()->id,
            'type' => 'residential_rent',
            'start_date' => '2026-08-01',
            'monthly_rent' => 300000,
            'commission_amount' => 1,
        ])->assertForbidden()->assertJsonPath('code', 'lease.commission_forbidden');

        $this->activate($lease);
        $entries = $this->entries($lease);
        $this->assertEquals(90000.0, $entries[$a->id]['amount']);
        $this->assertSame($a->id, $lease->fresh()->agent_id);
    }

    /** verif-595 B1 — une vente créée par le bailleur ne dérive pas de commission de son taux. */
    public function test_b1_a_sale_created_by_the_landlord_derives_no_commission(): void
    {
        $this->actingAsApi($this->landlord());
        $id = $this->postJson('/api/leases', [
            'property_id' => $this->property->id,
            'tenant_id' => $this->landlordsTenant()->id,
            'type' => 'sale',
            'start_date' => '2026-08-01',
            'sale_price' => 50_000_000,
            'commission_rate' => 3,
        ])->assertCreated()->json('data.id');

        $this->assertNull(Lease::query()->findOrFail($id)->commission_amount);
    }

    /** verif-595 B1 — le personnel sans `leases.create` ne fixe pas la commission non plus. */
    public function test_b1_staff_without_leases_create_cannot_set_the_commission_terms(): void
    {
        [, , , $lease] = $this->scenarioAc9();

        $this->actingAsApi($this->adminWithout($this->agency, Capability::LeasesCreate));
        $this->patchJson("/api/leases/{$lease->id}", ['commission_amount' => 1])
            ->assertForbidden()->assertJsonPath('code', 'lease.commission_forbidden');
        $this->assertEquals(300000.0, (float) $lease->fresh()->commission_amount);
    }

    /** verif-595 B1 — hors brouillon, la commission a déjà été ventilée : 422, même pour l'admin. */
    public function test_b1_the_commission_terms_are_locked_once_activated(): void
    {
        [$a, $b, , $lease] = $this->scenarioAc9();
        $this->activate($lease);

        $this->actingAsApi($this->admin);
        $this->patchJson("/api/leases/{$lease->id}", ['commission_amount' => 999_000])
            ->assertStatus(422)->assertJsonPath('code', 'lease.commission_locked');
        $this->patchJson("/api/leases/{$lease->id}", ['agent_id' => $b->id])
            ->assertStatus(422)->assertJsonPath('code', 'lease.commission_locked');
        $this->assertEquals(300000.0, (float) $lease->fresh()->commission_amount);
        $this->assertSame($a->id, $lease->fresh()->agent_id);
    }

    /**
     * verif-595 B1 — la tuile d'agence lit le grand livre : une écriture directe de
     * `leases.commission_amount` après l'activation ne la fait pas diverger.
     */
    public function test_b1_the_agency_tile_reads_the_frozen_base_not_the_lease(): void
    {
        [, , , $lease] = $this->scenarioAc9();
        $this->activate($lease);

        DB::table('leases')->where('id', $lease->id)->update(['commission_amount' => 99_000_000]);

        $this->actingAsApi($this->admin);
        $this->assertSame(300000.0, (float) $this->getJson('/api/dashboard/agency')->assertOk()->json('data.finance.commission_month'));
    }

    /** verif-595 m6 — la commission d'agence n'est rendue qu'au personnel : ni au bailleur, ni au locataire. */
    public function test_m6_the_lease_commission_is_shown_to_agency_staff_only(): void
    {
        $tenantUser = User::factory()->create();
        $this->tenant->forceFill(['user_id' => $tenantUser->id])->save();
        $lease = $this->createLease(['commission_amount' => 300000]);

        $this->actingAsApi($this->admin);
        $this->getJson("/api/leases/{$lease->id}")->assertOk()->assertJsonPath('data.commission_amount', 300000);
        $this->assertSame(300000, $this->getJson('/api/leases')->assertOk()->json('data.0.commission_amount'));

        foreach ([$this->landlord(), $tenantUser] as $reader) {
            $this->actingAsApi($reader);
            $this->getJson("/api/leases/{$lease->id}")->assertOk()->assertJsonMissingPath('data.commission_amount');
        }
    }
}
