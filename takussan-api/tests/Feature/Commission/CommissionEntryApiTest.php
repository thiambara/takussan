<?php

namespace Tests\Feature\Commission;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Commission\CommissionLedgerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-595 — AC13 : le grand livre est cloisonné (ADR-0049 §3).
 *
 * Chaque geste refusé est joué sous step-up : sans lui, le 403 viendrait du middleware et ne dirait
 * rien de la policy, que l'ablation retire.
 */
class CommissionEntryApiTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $a;

    private User $b;

    private CommissionEntry $lineA;

    private CommissionEntry $lineB;

    private CommissionEntry $foreign;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->a = $this->agencyAgent($this->agency);
        $this->b = $this->agencyAgent($this->agency);
        $lease = Lease::factory()->create(['agency_id' => $this->agency->id]);
        $this->lineA = $this->line($this->agency, $lease, $this->a, 90_000);
        $this->lineB = $this->line($this->agency, $lease, $this->b, 60_000);

        $other = Agency::factory()->create();
        $this->foreign = $this->line($other, Lease::factory()->create(['agency_id' => $other->id]), $this->agencyAgent($other), 40_000);
    }

    private function line(Agency $agency, Lease $lease, User $beneficiary, float $amount): CommissionEntry
    {
        return CommissionEntry::factory()->create([
            'agency_id' => $agency->id,
            'lease_id' => $lease->id,
            'beneficiary_id' => $beneficiary->id,
            'amount' => $amount,
        ]);
    }

    /** @return list<int> */
    private function ids(): array
    {
        return collect($this->getJson('/api/commissions')->assertOk()->json('data'))->pluck('id')->sort()->values()->all();
    }

    public function test_ac13_an_agent_reads_only_his_own_lines(): void
    {
        $this->actingAsApi($this->a);

        $this->assertSame([$this->lineA->id], $this->ids());
        $this->assertEquals(90000.0, $this->getJson('/api/commissions')->json('meta.totals.due'));
    }

    public function test_ac13_the_admin_reads_every_line_of_his_agency_and_none_of_another(): void
    {
        $this->actingAsApi($this->admin);

        $this->assertSame([$this->lineA->id, $this->lineB->id], $this->ids());
        $this->assertEquals(150000.0, $this->getJson('/api/commissions')->json('meta.totals.due'));
    }

    public function test_a_landlord_has_no_ledger(): void
    {
        $landlord = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($landlord)->getJson('/api/commissions')->assertForbidden();
    }

    public function test_ac13_an_agent_cannot_mark_his_line_paid(): void
    {
        $this->actingWithStepUp($this->a);

        $this->postJson("/api/commissions/{$this->lineA->id}/mark-paid")->assertForbidden();
        $this->assertSame(CommissionEntryStatus::Due, $this->lineA->fresh()->status);
    }

    public function test_ac13_the_admin_marks_a_line_paid_and_the_gesture_is_logged(): void
    {
        $this->actingWithStepUp($this->admin);

        $this->postJson("/api/commissions/{$this->lineA->id}/mark-paid")
            ->assertOk()
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.paid_by_id', $this->admin->id);

        $this->assertSame(CommissionEntryStatus::Paid, $this->lineA->fresh()->status);
        $this->assertTrue(Activity::query()
            ->where('log_name', 'CommissionEntry')
            ->where('subject_type', CommissionEntry::class)
            ->where('subject_id', $this->lineA->id)
            ->where('event', 'updated')
            ->exists());

        // Une ligne versée ne change plus d'état.
        $this->postJson("/api/commissions/{$this->lineA->id}/cancel")->assertStatus(422)->assertJsonPath('code', 'commission.not_due');
    }

    public function test_ac13_the_admin_cannot_settle_a_line_of_another_agency(): void
    {
        $this->actingWithStepUp($this->admin);

        $this->postJson("/api/commissions/{$this->foreign->id}/mark-paid")->assertForbidden();
        $this->postJson("/api/commissions/{$this->foreign->id}/cancel")->assertForbidden();
        $this->assertSame(CommissionEntryStatus::Due, $this->foreign->fresh()->status);
    }

    public function test_an_admin_of_both_agencies_settles_only_under_the_profile_of_the_line(): void
    {
        // Contrat TCK-146 : un admin des deux agences, sous son profil de l'agence A, ne solde pas
        // une ligne de B. `canActAt` seul le laisserait passer.
        $hereProfile = AgencyAdminProfile::query()->where('user_id', $this->admin->id)->firstOrFail();
        AgencyAdminProfile::factory()->create(['user_id' => $this->admin->id, 'agency_id' => $this->foreign->agency_id]);
        $this->actingWithStepUp($this->admin);

        $this->withHeaders(['X-Profile-Id' => "agency_admin:{$hereProfile->id}"])
            ->postJson("/api/commissions/{$this->foreign->id}/mark-paid")->assertForbidden();
        $this->assertSame(CommissionEntryStatus::Due, $this->foreign->fresh()->status);
    }

    public function test_the_admin_cancels_a_due_line(): void
    {
        $this->actingWithStepUp($this->admin);

        $this->postJson("/api/commissions/{$this->lineB->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancelled_by_id', $this->admin->id);
    }

    public function test_mark_paid_requires_a_fresh_second_factor(): void
    {
        $this->actingAsApi($this->admin);

        $this->postJson("/api/commissions/{$this->lineA->id}/mark-paid")->assertForbidden();
        $this->assertSame(CommissionEntryStatus::Due, $this->lineA->fresh()->status);
    }

    /**
     * verif-595 M3 — « jamais sur sa propre ligne » : l'admin (`payouts.approve`) qui est aussi agent
     * de l'agence, bénéficiaire d'une ligne, ne la solde ni ne l'annule, sous l'un ou l'autre de ses
     * profils. Le test de l'agent ne le gardait pas : l'agent est refusé faute de capacité.
     */
    public function test_m3_the_admin_beneficiary_cannot_settle_his_own_line(): void
    {
        $agentProfile = AgentProfile::factory()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
        $adminProfile = AgencyAdminProfile::query()->where('user_id', $this->admin->id)->firstOrFail();
        $own = $this->line($this->agency, Lease::factory()->create(['agency_id' => $this->agency->id]), $this->admin, 50_000);
        $this->actingWithStepUp($this->admin);

        foreach (["agency_admin:{$adminProfile->id}", "agent:{$agentProfile->id}"] as $profile) {
            foreach (['mark-paid', 'cancel'] as $gesture) {
                $this->withHeaders(['X-Profile-Id' => $profile])
                    ->postJson("/api/commissions/{$own->id}/{$gesture}")->assertForbidden();
            }
        }
        $this->assertSame(CommissionEntryStatus::Due, $own->fresh()->status);

        // Témoin : la ligne d'un autre bénéficiaire se solde, sous le même profil.
        $this->withHeaders(['X-Profile-Id' => "agency_admin:{$adminProfile->id}"])
            ->postJson("/api/commissions/{$this->lineA->id}/mark-paid")->assertOk();
    }

    /**
     * verif-595 m2 — le solde lit la ligne sous `FOR UPDATE`, DANS la transaction du geste : deux
     * gestes concurrents (versée ∥ annulée) ne passent pas tous les deux. Relevé par `DB::listen`,
     * avec le niveau de transaction au moment de la requête : un verrou pris hors transaction (au
     * niveau de celle du test) ne tiendrait rien en production.
     */
    public function test_m2_settling_locks_the_line_inside_its_own_transaction(): void
    {
        $this->actingWithStepUp($this->admin);
        $baseline = DB::transactionLevel();
        $locks = [];
        DB::listen(function ($query) use (&$locks): void {
            if (str_contains($query->sql, 'commission_entries') && str_contains(strtolower($query->sql), 'for update')) {
                $locks[] = DB::transactionLevel();
            }
        });

        $this->postJson("/api/commissions/{$this->lineA->id}/mark-paid")->assertOk();

        $this->assertNotEmpty($locks, 'aucune lecture verrouillée de la ligne');
        $this->assertGreaterThan($baseline, max($locks), 'le verrou doit être pris dans la transaction du geste');
    }

    /**
     * verif-595 passe 2 (MINEUR 1) — l'état se juge sur la ligne RELUE sous verrou, jamais sur
     * l'instance chargée avant le geste : un geste concurrent a pu la solder entre-temps. Juger
     * `$entry` laisse passer les deux gestes d'une course : verif-595 a mesuré deux 200, l'un écrasant
     * l'autre. Ce test rejoue la course sans concurrence.
     */
    public function test_m2bis_settling_judges_the_row_read_under_the_lock(): void
    {
        $entry = CommissionEntry::query()->findOrFail($this->lineA->id);
        $this->assertSame(CommissionEntryStatus::Due, $entry->status);
        CommissionEntry::query()->whereKey($entry->id)->update(['status' => CommissionEntryStatus::Paid->value, 'paid_at' => now()]);

        try {
            app(CommissionLedgerService::class)->cancel($entry, $this->admin);
            $this->fail('une ligne déjà soldée a été annulée');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('commission.not_due', $e->errorCode);
        }
        $this->assertSame(CommissionEntryStatus::Paid, $entry->fresh()->status);
    }
}
