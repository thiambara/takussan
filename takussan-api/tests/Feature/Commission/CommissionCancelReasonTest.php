<?php

namespace Tests\Feature\Commission;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2661 — une commission ne s'annule pas sans motif, et le bénéficiaire le lit sur sa ligne.
 */
class CommissionCancelReasonTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private User $admin;

    private User $agent;

    private CommissionEntry $line;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($agency);
        $this->agent = $this->agencyAgent($agency);
        $this->line = CommissionEntry::factory()->create([
            'agency_id' => $agency->id,
            'lease_id' => Lease::factory()->create(['agency_id' => $agency->id])->id,
            'beneficiary_id' => $this->agent->id,
        ]);
    }

    private function cancel(array $body)
    {
        $this->actingWithStepUp($this->admin);

        return $this->postJson("/api/commissions/{$this->line->id}/cancel", $body);
    }

    public function test_ac4_a_reason_code_is_required_and_a_text_for_other(): void
    {
        // TCK-2662 — la transition de TCK-2661 est retirée : un corps VIDE est refusé, la ligne reste due.
        $this->cancel([])->assertStatus(422)->assertJsonValidationErrors('reason_code');
        $this->cancel(['reason' => 'Erreur'])->assertStatus(422)->assertJsonValidationErrors('reason_code');
        $this->cancel(['reason_code' => 'other'])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->cancel(['reason_code' => 'oops'])->assertStatus(422)->assertJsonValidationErrors('reason_code');
        $this->cancel(['reason_code' => 'other', 'reason' => str_repeat('a', 501)])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->assertSame(CommissionEntryStatus::Due, $this->line->fresh()->status);

        $this->cancel(['reason_code' => 'other', 'reason' => 'Le bail a été signé par erreur au nom de la mauvaise agence.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancel_reason_code', 'other');
    }

    public function test_ac4_the_beneficiary_reads_the_code_and_the_text_on_his_line(): void
    {
        $this->cancel(['reason_code' => 'other', 'reason' => 'Part comptée deux fois'])->assertOk();

        $row = collect($this->actingAsApi($this->agent)->getJson('/api/commissions')->assertOk()->json('data'))->sole();
        $this->assertSame('cancelled', $row['status']);
        $this->assertSame('other', $row['cancel_reason_code']);
        $this->assertSame('Part comptée deux fois', $row['cancel_reason']);
    }

    public function test_a_listed_reason_needs_no_text(): void
    {
        $this->cancel(['reason_code' => 'lease_terminated_before_move_in'])
            ->assertOk()
            ->assertJsonPath('data.cancel_reason_code', 'lease_terminated_before_move_in')
            ->assertJsonPath('data.cancel_reason', null);
    }

    /** L'autorisation précède la validation : l'agent reçoit 403, pas la liste des motifs. */
    public function test_the_agent_is_refused_before_validation(): void
    {
        $this->actingWithStepUp($this->agent);

        $this->postJson("/api/commissions/{$this->line->id}/cancel", [])->assertForbidden();
    }
}
