<?php

namespace Tests\Feature\Accounting;

use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\RapprochementFixture;

/**
 * TCK-2674 (AC3, AC4) — `POST /api/agencies/{agency}/bank-statement-lines/confirm-batch` : confirmer
 * d'un geste les lignes proposées, par le geste unitaire `match` lui-même, TOUT OU RIEN.
 */
class BankStatementLinesConfirmBatchTest extends ApiTestCase
{
    use RapprochementFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpRapprochement();
    }

    /** @param  list<int>  $ids */
    private function confirm(array $ids, ?User $as = null): TestResponse
    {
        $this->actingAsApi($as ?? $this->admin);

        return $this->postJson("/api/agencies/{$this->agency->id}/bank-statement-lines/confirm-batch", ['line_ids' => $ids]);
    }

    private function confirmedCount(): int
    {
        return BankStatementLine::query()->where('match_status', BankStatementLineMatchStatus::Confirmed->value)->count();
    }

    public function test_trois_lignes_proposees_confirmees_comme_par_match(): void
    {
        $statement = $this->statement();
        $payments = collect(range(1, 3))->map(fn (int $i) => $this->leasePayment(['amount' => 100000 + $i]));
        $lines = $payments->map(fn ($p) => $this->suggestedLine($p, 95, statement: $statement));

        $this->confirm($lines->pluck('id')->all())->assertOk()
            ->assertJsonPath('data.count', 3)
            ->assertJsonPath('data.line_ids', $lines->pluck('id')->all());

        foreach ($lines as $i => $line) {
            $this->assertSame(BankStatementLineMatchStatus::Confirmed, $line->fresh()->match_status);
            $this->assertSame($this->admin->id, (int) $line->fresh()->confirmed_by);
            $this->assertSame($line->id, (int) $payments[$i]->fresh()->bank_statement_line_id);
            $this->assertNotNull($payments[$i]->fresh()->bank_reconciled_at);
        }
        // Le journal du geste unitaire, une ligne par confirmation.
        $this->assertSame(3, Activity::query()->where('event', 'matched')->count());
    }

    public function test_ac3_une_ligne_non_proposee_dans_le_lot_et_rien_n_est_confirme(): void
    {
        $statement = $this->statement();
        $a = $this->suggestedLine($this->leasePayment(), 95, statement: $statement);
        $b = $this->suggestedLine($this->leasePayment(['amount' => 90000]), 92, statement: $statement);
        $unmatched = BankStatementLine::factory()->create(['bank_statement_id' => $statement->id, 'match_status' => BankStatementLineMatchStatus::Unmatched]);

        $this->confirm([$a->id, $b->id, $unmatched->id])->assertStatus(422)->assertJsonPath('code', 'reconciliation.batch_not_confirmable');

        $this->assertSame(0, $this->confirmedCount());
        $this->assertSame(BankStatementLineMatchStatus::Suggested, $a->fresh()->match_status);
    }

    public function test_une_ligne_d_une_autre_agence_ou_inconnue_et_rien_n_est_confirme(): void
    {
        $ours = $this->suggestedLine($this->leasePayment(), 95);
        $theirs = $this->suggestedLine($this->leasePayment(), 95, statement: $this->statement(agency: $this->otherAgency));

        $this->confirm([$ours->id, $theirs->id])->assertStatus(422)->assertJsonPath('code', 'reconciliation.batch_not_confirmable');
        $this->confirm([$ours->id, 999999999])->assertStatus(422)->assertJsonPath('code', 'reconciliation.batch_not_confirmable');
        $this->assertSame(0, $this->confirmedCount());
    }

    public function test_un_releve_clos_et_rien_n_est_confirme(): void
    {
        $ours = $this->suggestedLine($this->leasePayment(), 95);
        $closed = $this->suggestedLine($this->leasePayment(), 95, statement: $this->statement(['status' => BankStatementStatus::Reconciled]));

        $this->confirm([$ours->id, $closed->id])->assertStatus(422)->assertJsonPath('code', 'reconciliation.batch_not_confirmable');
        $this->assertSame(0, $this->confirmedCount());
    }

    public function test_une_ligne_deja_confirmee_dans_le_lot(): void
    {
        $statement = $this->statement();
        $ours = $this->suggestedLine($this->leasePayment(), 95, statement: $statement);
        $done = $this->suggestedLine($this->leasePayment(['amount' => 60000]), 95, ['match_status' => BankStatementLineMatchStatus::Confirmed], $statement);

        $this->confirm([$ours->id, $done->id])->assertStatus(422)->assertJsonPath('code', 'reconciliation.batch_not_confirmable');
        $this->assertSame(BankStatementLineMatchStatus::Suggested, $ours->fresh()->match_status);
    }

    public function test_un_refus_du_geste_unitaire_en_fin_de_lot_annule_tout(): void
    {
        // La 2e ligne propose le même paiement que la 1re : la confirmation de la 1re la remet
        // `unmatched` (TCK-1919), et le lot entier tombe.
        $statement = $this->statement();
        $payment = $this->leasePayment();
        $first = $this->suggestedLine($payment, 95, statement: $statement);
        $second = $this->suggestedLine($payment, 90, statement: $statement);

        $this->confirm([$first->id, $second->id])->assertStatus(422);

        $this->assertSame(0, $this->confirmedCount());
        $this->assertNull($payment->fresh()->bank_statement_line_id);
        $this->assertSame(BankStatementLineMatchStatus::Suggested, $second->fresh()->match_status);
        $this->assertSame(0, Activity::query()->where('event', 'matched')->count());
    }

    public function test_une_devise_refusee_par_match_en_fin_de_lot_annule_tout(): void
    {
        $statement = $this->statement();
        $ok = $this->suggestedLine($this->leasePayment(), 95, statement: $statement);
        $eur = $this->suggestedLine($this->leasePayment(['amount' => 70000]), 95, ['currency' => 'EUR'], $statement);

        $this->confirm([$ok->id, $eur->id])->assertStatus(422);

        $this->assertSame(0, $this->confirmedCount());
        $this->assertNull($ok->fresh()->confirmed_at);
    }

    public function test_au_plus_deux_cents_lignes_distinctes(): void
    {
        $this->confirm(range(1, 201))->assertUnprocessable()->assertJsonValidationErrors('line_ids');
        $this->confirm([])->assertUnprocessable()->assertJsonValidationErrors('line_ids');
        $this->confirm([5, 5])->assertUnprocessable()->assertJsonValidationErrors('line_ids.0');
    }

    public function test_ac4_un_agent_et_une_autre_agence_recoivent_403(): void
    {
        $line = $this->suggestedLine($this->leasePayment(), 95);

        $this->confirm([$line->id], $this->agent)->assertForbidden();
        $this->confirm([$line->id], $this->otherAdmin)->assertForbidden();
        // Le 403 passe avant le 422.
        $this->confirm([], $this->agent)->assertForbidden();
        $this->assertSame(0, $this->confirmedCount());
    }
}
