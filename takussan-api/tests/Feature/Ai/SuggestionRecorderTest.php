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
        $this->assertSame(['pieces' => ['from' => null, 'to' => 4], 'titre' => ['from' => 'Villa', 'to' => 'Villa F4']], $suggestion->correction_diff);
        $this->assertSame('Villa, 100 francs', $suggestion->input_snapshot);
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
