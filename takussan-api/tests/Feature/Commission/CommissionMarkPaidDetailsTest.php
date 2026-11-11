<?php

namespace Tests\Feature\Commission;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Lease;
use App\Models\User;
use App\Services\Commission\CommissionLedgerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2661 — payer une commission, c'est en garder la preuve : la date (un jour de Dakar, au plus
 * aujourd'hui, jamais avant le jour où la ligne est née), le moyen, et la référence hors espèces.
 * Le bénéficiaire en est avisé, une fois.
 */
class CommissionMarkPaidDetailsTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $agent;

    private CommissionEntry $line;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-11 15:00:00', 'Africa/Dakar'));

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = $this->agencyAgent($this->agency);
        $this->line = $this->line(now()->subDays(10));
    }

    private function line(\DateTimeInterface $earnedAt): CommissionEntry
    {
        return CommissionEntry::factory()->create([
            'agency_id' => $this->agency->id,
            'lease_id' => Lease::factory()->create(['agency_id' => $this->agency->id])->id,
            'beneficiary_id' => $this->agent->id,
            'amount' => 75_000,
            'earned_at' => $earnedAt,
        ]);
    }

    private function pay(CommissionEntry $line, array $body)
    {
        $this->actingWithStepUp($this->admin);

        return $this->postJson("/api/commissions/{$line->id}/mark-paid", $body);
    }

    public function test_ac1_the_method_is_required_and_the_reference_too_except_in_cash(): void
    {
        // Un corps VIDE garde le geste d'avant, le temps de TCK-2662 (`CommissionTransitionalEmptyBodyTest`).
        $this->pay($this->line, ['payment_reference' => 'W-1'])->assertStatus(422)->assertJsonValidationErrors('payment_method');
        $this->pay($this->line, ['payment_method' => 'wave'])->assertStatus(422)->assertJsonValidationErrors('payment_reference');
        $this->assertSame(CommissionEntryStatus::Due, $this->line->fresh()->status);

        $this->pay($this->line, ['payment_method' => 'cash'])
            ->assertOk()
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.payment_method', 'cash')
            ->assertJsonPath('data.payment_reference', null);
    }

    public function test_a_mobile_money_payment_keeps_its_reference(): void
    {
        $this->pay($this->line, ['payment_method' => 'wave', 'payment_reference' => 'WAVE-77-0042'])
            ->assertOk()
            ->assertJsonPath('data.payment_method', 'wave')
            ->assertJsonPath('data.payment_reference', 'WAVE-77-0042');

        $fresh = $this->line->fresh();
        $this->assertSame('wave', $fresh->payment_method->value);
        $this->assertSame('WAVE-77-0042', $fresh->payment_reference);
        $this->assertSame($this->admin->id, $fresh->paid_by_id);
    }

    public function test_only_the_disbursement_methods_are_accepted_and_the_reference_is_bounded(): void
    {
        // `card` et `check` sont des moyens de paiement du dépôt, pas d'un décaissement d'agence.
        $this->pay($this->line, ['payment_method' => 'card', 'payment_reference' => 'X'])->assertStatus(422)->assertJsonValidationErrors('payment_method');
        $this->pay($this->line, ['payment_method' => 'check', 'payment_reference' => 'X'])->assertStatus(422)->assertJsonValidationErrors('payment_method');
        $this->pay($this->line, ['payment_method' => 'bank_transfer', 'payment_reference' => str_repeat('a', 101)])->assertStatus(422)->assertJsonValidationErrors('payment_reference');
        $this->pay($this->line, ['payment_method' => 'bank_transfer', 'payment_reference' => str_repeat('a', 100)])->assertOk();
    }

    public function test_the_payment_date_is_a_dakar_day_neither_future_nor_before_the_line(): void
    {
        $this->pay($this->line, ['payment_method' => 'cash', 'paid_at' => '2026-11-12'])->assertStatus(422)->assertJsonValidationErrors('paid_at');
        $this->pay($this->line, ['payment_method' => 'cash', 'paid_at' => '2026-10-31'])->assertStatus(422)->assertJsonValidationErrors('paid_at');
        $this->pay($this->line, ['payment_method' => 'cash', 'paid_at' => '11/05/2026'])->assertStatus(422)->assertJsonValidationErrors('paid_at');
        $this->assertSame(CommissionEntryStatus::Due, $this->line->fresh()->status);

        // Un jour passé : le début de ce jour, à Dakar.
        $this->pay($this->line, ['payment_method' => 'cash', 'paid_at' => '2026-11-05'])->assertOk();
        $this->assertSame('2026-11-05 00:00:00', $this->line->fresh()->paid_at->copy()->setTimezone('Africa/Dakar')->format('Y-m-d H:i:s'));
    }

    /** Une ligne née ce matin se paie aujourd'hui : la comparaison se fait au jour, pas à l'heure. */
    public function test_a_line_born_this_morning_is_paid_today(): void
    {
        $line = $this->line(Carbon::parse('2026-11-11 10:00:00', 'Africa/Dakar'));

        $this->pay($line, ['payment_method' => 'cash', 'paid_at' => '2026-11-11'])->assertOk();
        // Aujourd'hui (ou sans date) : l'instant du geste.
        $this->assertTrue($line->fresh()->paid_at->equalTo(now()));
    }

    public function test_the_beneficiary_is_notified_once(): void
    {
        $this->pay($this->line, ['payment_method' => 'wave', 'payment_reference' => 'W-1'])->assertOk();

        $notifications = AppNotification::query()->where('code', 'commission.paid')->get();
        $this->assertCount(1, $notifications);
        $this->assertSame($this->agent->id, $notifications[0]->user_id);
        $this->assertSame(1, $notifications[0]->params['count']);
        $this->assertSame('75000.00', $notifications[0]->params['amount']['amount']);
        $this->assertSame('/app/commissions', $notifications[0]->target['path']);
    }

    /**
     * Le service seul (le chemin du seeder du grand livre) n'avise personne : un seeder écrit ses
     * notifications sans les envoyer. C'est le geste HTTP qui avise.
     */
    public function test_the_ledger_service_alone_sends_nothing(): void
    {
        app(CommissionLedgerService::class)->markPaid($this->line, $this->admin);

        $this->assertSame(CommissionEntryStatus::Paid, $this->line->fresh()->status);
        $this->assertSame(0, AppNotification::query()->where('code', 'commission.paid')->count());
    }

    /** Une ligne déjà payée ne repart pas, et n'avise personne une seconde fois. */
    public function test_a_line_already_paid_is_refused_without_a_second_notice(): void
    {
        $this->pay($this->line, ['payment_method' => 'cash'])->assertOk();
        $this->pay($this->line, ['payment_method' => 'cash'])->assertStatus(422)->assertJsonPath('code', 'commission.not_due');

        $this->assertSame(1, AppNotification::query()->where('code', 'commission.paid')->count());
    }

    /** L'autorisation précède la validation : l'agent ne lit pas la liste des moyens. */
    public function test_the_agent_is_refused_before_validation(): void
    {
        $this->actingWithStepUp($this->agent);

        $this->postJson("/api/commissions/{$this->line->id}/mark-paid", [])->assertForbidden();
        $this->assertSame(CommissionEntryStatus::Due, $this->line->fresh()->status);
    }
}
