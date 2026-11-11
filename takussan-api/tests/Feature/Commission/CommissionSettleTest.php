<?php

namespace Tests\Feature\Commission;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2661 — l'admin solde en une fois ce qu'il doit à un agent : toutes les lignes ou aucune, d'un
 * même bénéficiaire et d'une même agence, avec la même preuve, et une seule notification.
 */
class CommissionSettleTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $agent;

    private User $colleague;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-11 15:00:00', 'Africa/Dakar'));

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = $this->agencyAgent($this->agency);
        $this->colleague = $this->agencyAgent($this->agency);
    }

    private function line(User $beneficiary, float $amount, ?Agency $agency = null, CommissionEntryStatus $status = CommissionEntryStatus::Due): CommissionEntry
    {
        $agency ??= $this->agency;

        return CommissionEntry::factory()->create([
            'agency_id' => $agency->id,
            'lease_id' => Lease::factory()->create(['agency_id' => $agency->id])->id,
            'beneficiary_id' => $beneficiary->id,
            'amount' => $amount,
            'status' => $status,
            'paid_at' => $status === CommissionEntryStatus::Paid ? now()->subDay() : null,
            'earned_at' => now()->subDays(20),
        ]);
    }

    /** @param  list<CommissionEntry>  $lines */
    private function settle(array $lines, array $extra = [], ?User $as = null, ?int $beneficiaryId = null)
    {
        $this->actingWithStepUp($as ?? $this->admin);

        return $this->postJson('/api/commissions/settle', [
            'beneficiary_id' => $beneficiaryId ?? $this->agent->id,
            'entry_ids' => array_map(fn (CommissionEntry $l) => $l->id, $lines),
            'paid_at' => '2026-11-10',
            'payment_method' => 'wave',
            'payment_reference' => 'WAVE-SOLDE-11',
            ...$extra,
        ]);
    }

    /** @param  list<CommissionEntry>  $lines */
    private function statuses(array $lines): array
    {
        return array_map(fn (CommissionEntry $l) => $l->fresh()->status, $lines);
    }

    public function test_ac3_three_due_lines_are_paid_with_the_same_proof_and_one_notice(): void
    {
        $lines = [$this->line($this->agent, 10_000), $this->line($this->agent, 20_000), $this->line($this->agent, 30_000)];

        $this->settle($lines)->assertOk()->assertJsonCount(3, 'data');

        foreach ($lines as $line) {
            $fresh = $line->fresh();
            $this->assertSame(CommissionEntryStatus::Paid, $fresh->status);
            $this->assertSame('2026-11-10', $fresh->paid_at->copy()->setTimezone('Africa/Dakar')->toDateString());
            $this->assertSame('wave', $fresh->payment_method->value);
            $this->assertSame('WAVE-SOLDE-11', $fresh->payment_reference);
            $this->assertSame($this->admin->id, $fresh->paid_by_id);
        }

        $notices = AppNotification::query()->where('code', 'commission.paid')->get();
        $this->assertCount(1, $notices);
        $this->assertSame($this->agent->id, $notices[0]->user_id);
        $this->assertSame(3, $notices[0]->params['count']);
        $this->assertSame('60000.00', $notices[0]->params['amount']['amount']);
    }

    /** La ligne déjà payée a le plus grand id : une boucle non atomique aurait payé les deux autres. */
    public function test_ac2_one_line_already_paid_refuses_the_whole_settlement(): void
    {
        $due1 = $this->line($this->agent, 10_000);
        $due2 = $this->line($this->agent, 20_000);
        $paid = $this->line($this->agent, 30_000, status: CommissionEntryStatus::Paid);

        $this->settle([$due1, $due2, $paid])->assertStatus(422)->assertJsonPath('code', 'commission.not_due');

        $this->assertSame([CommissionEntryStatus::Due, CommissionEntryStatus::Due], $this->statuses([$due1, $due2]));
        $this->assertSame(0, AppNotification::query()->where('code', 'commission.paid')->count());
    }

    public function test_a_line_of_another_beneficiary_or_agency_or_unknown_refuses_the_whole_settlement(): void
    {
        $mine = $this->line($this->agent, 10_000);
        $other = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $other->id]);

        $cases = [
            'autre bénéficiaire' => [$mine, $this->line($this->colleague, 20_000)],
            'autre agence' => [$mine, $this->line($this->agent, 20_000, $other)],
        ];
        foreach ($cases as $case => $lines) {
            $this->settle($lines)->assertStatus(422)->assertJsonPath('code', 'commission.settle_mismatch');
            $this->assertSame([CommissionEntryStatus::Due, CommissionEntryStatus::Due], $this->statuses($lines), $case);
        }

        $this->settle([$mine], ['entry_ids' => [$mine->id, 999_999_999]])->assertStatus(422)->assertJsonPath('code', 'commission.settle_mismatch');
        $this->assertSame(CommissionEntryStatus::Due, $mine->fresh()->status);
    }

    public function test_a_payment_date_before_one_line_was_earned_refuses_the_whole_settlement(): void
    {
        $old = $this->line($this->agent, 10_000);
        $recent = $this->line($this->agent, 20_000);
        $recent->forceFill(['earned_at' => Carbon::parse('2026-11-10 18:00:00', 'Africa/Dakar')])->save();

        $this->settle([$old, $recent], ['paid_at' => '2026-11-09'])->assertStatus(422)->assertJsonPath('code', 'commission.paid_before_earned');
        $this->assertSame([CommissionEntryStatus::Due, CommissionEntryStatus::Due], $this->statuses([$old, $recent]));

        // Le jour même où la plus récente est née : accepté.
        $this->settle([$old, $recent], ['paid_at' => '2026-11-10'])->assertOk();
    }

    public function test_ac5_an_agent_without_payouts_approve_is_refused_before_validation(): void
    {
        $lines = [$this->line($this->colleague, 10_000)];

        $this->settle($lines, as: $this->agent, beneficiaryId: $this->colleague->id)->assertForbidden();
        $this->settle($lines, ['payment_method' => 'sms', 'entry_ids' => 'x'], $this->agent, $this->colleague->id)->assertForbidden();
        $this->assertSame([CommissionEntryStatus::Due], $this->statuses($lines));
    }

    public function test_the_admin_does_not_settle_his_own_lines(): void
    {
        AgentProfile::factory()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
        $own = [$this->line($this->admin, 10_000)];

        $this->settle($own, beneficiaryId: $this->admin->id)->assertForbidden();
        $this->assertSame([CommissionEntryStatus::Due], $this->statuses($own));
    }

    public function test_the_body_is_validated(): void
    {
        $line = $this->line($this->agent, 10_000);

        $this->settle([$line], ['entry_ids' => []])->assertStatus(422)->assertJsonValidationErrors('entry_ids');
        $this->settle([$line], ['entry_ids' => [$line->id, $line->id]])->assertStatus(422)->assertJsonValidationErrors('entry_ids.0');
        $this->settle([$line], ['entry_ids' => range(1, 101)])->assertStatus(422)->assertJsonValidationErrors('entry_ids');
        $this->settle([$line], ['payment_method' => 'wave', 'payment_reference' => null])->assertStatus(422)->assertJsonValidationErrors('payment_reference');
        $this->settle([$line], ['payment_method' => 'cash', 'payment_reference' => null])->assertOk();
    }

    /** Second facteur ACTIVÉ mais pas frais : c'est le step-up qui refuse, pas l'absence de 2FA. */
    public function test_settling_requires_a_fresh_second_factor(): void
    {
        $line = $this->line($this->agent, 10_000);
        $this->admin->forceFill(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET])->save();
        $this->actingAsApi($this->admin);

        $this->postJson('/api/commissions/settle', [
            'beneficiary_id' => $this->agent->id, 'entry_ids' => [$line->id], 'payment_method' => 'cash',
        ])->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        $this->assertSame(CommissionEntryStatus::Due, $line->fresh()->status);
    }
}
