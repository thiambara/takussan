<?php

namespace Tests\Feature\Ai;

use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\User;
use App\Services\Ai\AiResult;
use App\Services\Ai\SuggestionRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use LogicException;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/** TCK-2384 (AC1) — l'IA propose, un humain décide ; la correction se garde en différentiel exact. */
class SuggestionRecorderTest extends TestCase
{
    use RefreshDatabase;

    private function suggestion(array $proposal = ['titre' => 'Villa', 'prix' => 100]): AiSuggestion
    {
        $call = AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success']);

        return app(SuggestionRecorder::class)->record(new AiResult('{}', $proposal, $call, false), inputSnapshot: 'Villa, 100 francs');
    }

    public function test_an_edit_keeps_the_exact_difference_and_becomes_edited(): void
    {
        $suggestion = app(SuggestionRecorder::class)->edit($this->suggestion(), ['titre' => 'Villa F4', 'prix' => 100, 'pieces' => 4], User::factory()->create());

        $this->assertSame(AiSuggestionDecision::Edited, $suggestion->decision);
        // Relu depuis jsonb : l'ordre des clés est celui du stockage (par longueur), donc assertEquals ;
        // l'ordre déterministe de diff() est vérifié à part, en assertSame.
        $expected = ['pieces' => ['from' => null, 'to' => 4], 'titre' => ['from' => 'Villa', 'to' => 'Villa F4']];
        $this->assertEquals($expected, $suggestion->correction_diff);
        $this->assertSame($expected, SuggestionRecorder::diff(['titre' => 'Villa', 'prix' => 100], ['titre' => 'Villa F4', 'prix' => 100, 'pieces' => 4]));
        $this->assertSame('Villa, 100 francs', $suggestion->input_snapshot);
    }

    public function test_an_explicit_proposal_replaces_the_structured_output_and_the_edit_diffs_against_it(): void
    {
        $call = AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success']);
        $recorder = app(SuggestionRecorder::class);

        $suggestion = $recorder->record(
            new AiResult('{}', ['phones' => ['+221771234567'], 'price' => '450.000f'], $call, false),
            proposal: ['price' => 450000, 'contract' => 'rent'],
        );

        $this->assertEquals(['price' => 450000, 'contract' => 'rent'], $suggestion->fresh()->proposal);
        $edited = $recorder->edit($suggestion, ['price' => 500000, 'contract' => 'rent'], User::factory()->create());
        $this->assertEquals(['price' => ['from' => 450000, 'to' => 500000]], $edited->correction_diff);
    }

    public function test_without_an_explicit_proposal_the_structured_output_is_kept(): void
    {
        $this->assertEquals(['titre' => 'Villa', 'prix' => 100], $this->suggestion()->fresh()->proposal);
    }

    public function test_an_edit_identical_to_the_proposal_is_an_acceptance(): void
    {
        $suggestion = app(SuggestionRecorder::class)->edit($this->suggestion(), ['titre' => 'Villa', 'prix' => 100], User::factory()->create());

        $this->assertSame(AiSuggestionDecision::Accepted, $suggestion->decision);
        $this->assertSame([], $suggestion->correction_diff);
    }

    public function test_a_decision_is_taken_once(): void
    {
        $recorder = app(SuggestionRecorder::class);
        $suggestion = $recorder->reject($this->suggestion(), User::factory()->create());

        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('ai.suggestion_already_decided');
        $recorder->accept($suggestion, User::factory()->create());
    }

    public function test_a_stale_instance_cannot_overwrite_a_decision(): void
    {
        $recorder = app(SuggestionRecorder::class);
        $id = $this->suggestion()->id;
        $first = AiSuggestion::query()->findOrFail($id);
        $second = AiSuggestion::query()->findOrFail($id);
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $recorder->accept($first, $userA);

        try {
            $recorder->reject($second, $userB);
            $this->fail('La seconde décision aurait dû être refusée.');
        } catch (LogicException $e) {
            $this->assertSame('ai.suggestion_already_decided', $e->getMessage());
        }

        $stored = AiSuggestion::query()->findOrFail($id);
        $this->assertSame(AiSuggestionDecision::Accepted, $stored->decision);
        $this->assertSame($userA->id, $stored->decided_by_id);
    }

    public function test_an_edit_on_a_stale_instance_is_refused_too(): void
    {
        $recorder = app(SuggestionRecorder::class);
        $id = $this->suggestion()->id;
        $first = AiSuggestion::query()->findOrFail($id);
        $second = AiSuggestion::query()->findOrFail($id);
        $userA = User::factory()->create();
        $recorder->reject($first, $userA);

        try {
            $recorder->edit($second, ['titre' => 'Autre'], User::factory()->create());
            $this->fail('La seconde décision aurait dû être refusée.');
        } catch (LogicException $e) {
            $this->assertSame('ai.suggestion_already_decided', $e->getMessage());
        }

        $stored = AiSuggestion::query()->findOrFail($id);
        $this->assertSame(AiSuggestionDecision::Rejected, $stored->decision);
        $this->assertNull($stored->final_value);
        $this->assertSame($userA->id, $stored->decided_by_id);
    }

    public function test_an_equal_value_with_another_key_order_is_an_acceptance(): void
    {
        $suggestion = $this->suggestion(['bien' => ['type' => 'villa', 'pieces' => 4], 'prix' => 100])->refresh();

        $decided = app(SuggestionRecorder::class)->edit(
            $suggestion,
            ['prix' => 100.0, 'bien' => ['pieces' => 4, 'type' => 'villa']],
            User::factory()->create(),
        );

        $this->assertSame(AiSuggestionDecision::Accepted, $decided->decision);
        $this->assertSame([], $decided->correction_diff);
    }

    public function test_a_numeric_string_is_still_a_difference(): void
    {
        $this->assertSame(
            ['prix' => ['from' => 100, 'to' => '100']],
            SuggestionRecorder::diff(['prix' => 100], ['prix' => '100']),
        );
    }

    public function test_acceptance_rates_count_decisions_per_usage(): void
    {
        $recorder = app(SuggestionRecorder::class);
        $user = User::factory()->create();
        $recorder->accept($this->suggestion(), $user);
        $recorder->edit($this->suggestion(), ['titre' => 'Autre'], $user);
        $recorder->reject($this->suggestion(), $user);
        $this->suggestion();

        $this->assertSame(
            [UsageDEssai::KEY => ['decided' => 3, 'accepted' => 1, 'edited' => 1, 'rejected' => 1, 'rate' => 0.3333]],
            $recorder->acceptanceRates(now()->subDay()),
        );
    }
}
