<?php

namespace Tests\Feature\Commission;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2661 — transition, retiré par TCK-2662.
 *
 * Le registre du front d'aujourd'hui poste `mark-paid` et `cancel` avec un corps VIDE : il garde
 * exactement le geste d'avant TCK-2661 (payée maintenant, sans preuve ni avis ; annulée sans motif).
 * Dès qu'un corps est envoyé, les règles de TCK-2661 s'appliquent en entier. Ce test part avec la
 * transition, dans TCK-2662.
 */
class CommissionTransitionalEmptyBodyTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private User $admin;

    private User $agent;

    private CommissionEntry $line;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-11 15:00:00', 'Africa/Dakar'));

        $agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($agency);
        $this->agent = $this->agencyAgent($agency);
        $this->line = CommissionEntry::factory()->create([
            'agency_id' => $agency->id,
            'lease_id' => Lease::factory()->create(['agency_id' => $agency->id])->id,
            'beneficiary_id' => $this->agent->id,
        ]);
    }

    public function test_an_empty_body_marks_paid_now_without_proof_nor_notice(): void
    {
        $this->actingWithStepUp($this->admin);

        $this->postJson("/api/commissions/{$this->line->id}/mark-paid", [])
            ->assertOk()
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.paid_by_id', $this->admin->id)
            ->assertJsonPath('data.payment_method', null)
            ->assertJsonPath('data.payment_reference', null);

        $this->assertTrue($this->line->fresh()->paid_at->equalTo(now()));
        $this->assertSame(0, AppNotification::query()->where('code', 'commission.paid')->count());
    }

    public function test_an_empty_body_cancels_without_a_reason(): void
    {
        $this->actingWithStepUp($this->admin);

        $this->postJson("/api/commissions/{$this->line->id}/cancel", [])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancel_reason_code', null);
    }

    /** La transition ne vaut que pour un corps VIDE : le moindre champ fait jouer les règles. */
    public function test_any_field_brings_the_full_rules_back(): void
    {
        $this->actingWithStepUp($this->admin);

        $this->postJson("/api/commissions/{$this->line->id}/mark-paid", ['payment_reference' => 'X'])
            ->assertStatus(422)->assertJsonValidationErrors('payment_method');
        $this->postJson("/api/commissions/{$this->line->id}/cancel", ['reason' => 'x'])
            ->assertStatus(422)->assertJsonValidationErrors('reason_code');
        $this->assertSame(CommissionEntryStatus::Due, $this->line->fresh()->status);
    }

    /** L'autorisation précède toujours : un corps vide ne fait pas passer l'agent. */
    public function test_an_empty_body_does_not_bypass_authorization(): void
    {
        $this->actingWithStepUp($this->agent);

        $this->postJson("/api/commissions/{$this->line->id}/mark-paid", [])->assertForbidden();
        $this->postJson("/api/commissions/{$this->line->id}/cancel", [])->assertForbidden();
        $this->assertSame(CommissionEntryStatus::Due, $this->line->fresh()->status);
    }
}
