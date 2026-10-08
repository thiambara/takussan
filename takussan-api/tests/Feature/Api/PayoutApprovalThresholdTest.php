<?php

namespace Tests\Feature\Api;

use App\Models\Enums\Capability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC8) — le seuil des quatre yeux : il ne s'active qu'avec deux personnes pour le tenir,
 * se règle par un détenteur de `payouts.approve`, et chaque changement laisse une trace.
 */
class PayoutApprovalThresholdTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_ac8_a_single_approver_cannot_enable_the_threshold(): void
    {
        $agency = $this->moneyAgency();
        $admin = $this->agencyAdmin($agency);
        // Un second admin à qui on a retiré la capacité ne compte pas.
        $this->adminWithout($agency, Capability::PayoutsApprove);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => 100_000, 'name' => 'Renommée'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'payout.threshold_needs_two_approvers');

        $this->assertNull($agency->fresh()->payout_approval_threshold);
        $this->assertNotSame('Renommée', $agency->fresh()->name);
    }

    public function test_ac8_two_approvers_enable_it_and_each_change_is_traced(): void
    {
        $agency = $this->moneyAgency();
        $admin = $this->agencyAdmin($agency);
        $second = $this->agencyAdmin($agency);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => 100_000])
            ->assertOk()
            ->assertJsonPath('data.payout_approval_threshold', 100000);
        // VERIF-594 M-2 — relever ou couper le seuil attend un second détenteur.
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => 250_000])->assertStatus(202);
        $this->confirmedBy($second, $agency->id);
        Sanctum::actingAs($admin);
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => null])->assertStatus(202);
        $this->confirmedBy($second, $agency->id);
        // Inchangé : pas de trace.
        Sanctum::actingAs($admin);
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => null])->assertOk();

        $this->assertNull($agency->fresh()->payout_approval_threshold);
        $trace = Activity::query()
            ->where('description', 'agency_payout_threshold_changed')
            ->where('subject_id', $agency->id)
            ->orderBy('id')
            ->get()
            ->map(fn (Activity $a): array => [$a->properties['old'], $a->properties['new'], $a->causer_id, $a->properties['requested_by'] ?? null]);

        $this->assertEquals([
            [null, 100000.0, $admin->id, null],
            [100000.0, 250000.0, $second->id, $admin->id],
            [250000.0, null, $second->id, $admin->id],
        ], $trace->all());
    }

    private function confirmedBy(User $approver, int $agencyId): void
    {
        Sanctum::actingAs($approver);
        $this->postJson("/api/agencies/{$agencyId}/payout-threshold/confirm")->assertOk();
    }

    public function test_ac8_a_member_without_payouts_approve_neither_sets_nor_clears_it(): void
    {
        $agency = $this->moneyAgency();
        $this->agencyAdmin($agency);
        $this->agencyAdmin($agency);
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        Sanctum::actingAs($this->adminWithout($agency, Capability::PayoutsApprove));

        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => 500_000])->assertForbidden();
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => null])->assertForbidden();

        $this->assertEquals(100000, (float) $agency->fresh()->payout_approval_threshold);
        $this->assertSame(0, Activity::query()->where('description', 'agency_payout_threshold_changed')->count());
    }

    public function test_the_threshold_is_not_mass_assignable(): void
    {
        $agency = $this->moneyAgency();
        $agency->fill(['payout_approval_threshold' => 1])->save();

        $this->assertNull($agency->fresh()->payout_approval_threshold);
    }
}
