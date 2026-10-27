<?php

namespace Tests\Feature\Ai;

use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiRefusalReason;
use App\Models\User;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\Data\TextUsage;
use Laravel\Ai\Responses\StructuredTextResponse;
use RuntimeException;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/**
 * TCK-2383 — la passerelle, sur les faux modèles du SDK : ordre des contrôles, refus journalisés,
 * bascule, cache, masquage. Aucun appel réseau.
 */
class AiGatewayTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private User $operateur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        $this->operateur = $this->actingAsRole('super_admin');
    }

    private function requete(string $input = 'Villa à Ngor, 100 francs', array $classes = [AiDataClass::Publique], bool $evaluation = false): AiRequest
    {
        return new AiRequest(UsageDEssai::KEY, $input, $classes, actor: $this->operateur, evaluation: $evaluation);
    }

    private function refus(AiRequest $requete): AiRefused
    {
        try {
            app(AiGateway::class)->run($requete);
        } catch (AiRefused $refus) {
            return $refus;
        }
        $this->fail('la passerelle devait refuser');
    }

    public function test_it_calls_the_first_link_of_the_role_and_journals_the_success(): void
    {
        $modeles = [];
        AgentDEssai::fake(function (string $prompt, $attachments, $provider, string $model) use (&$modeles) {
            $modeles[] = $model;

            return new StructuredTextResponse(['titre' => 'Villa', 'prix' => 100], '{}', new TextUsage(1_000_000, 0), new Meta('anthropic', $model));
        });

        $result = app(AiGateway::class)->run($this->requete());

        $this->assertSame(['modele-a'], $modeles);
        $this->assertSame(['titre' => 'Villa', 'prix' => 100], $result->structured);
        $this->assertFalse($result->fromCache);
        $call = AiCall::query()->sole();
        $this->assertSame(AiCallOutcome::Success, $call->outcome);
        $this->assertSame(['anthropic', 'modele-a', 1], [$call->provider, $call->model, $call->prompt_version]);
        $this->assertSame('1200.00', $call->cost_estimate);
        $this->assertSame($this->operateur->id, $call->actor_id);
    }

    public function test_a_failing_first_link_falls_over_to_the_next_and_both_are_journaled(): void
    {
        AgentDEssai::fake(function (string $prompt, $attachments, $provider, string $model) {
            if ($model === 'modele-a') {
                throw RateLimitedException::forProvider('anthropic');
            }

            return ['titre' => 'Villa', 'prix' => 100];
        });

        app(AiGateway::class)->run($this->requete());

        $this->assertSame(
            [['modele-a', AiCallOutcome::FailedOver, 'RateLimitedException'], ['modele-b', AiCallOutcome::Success, null]],
            AiCall::query()->orderBy('id')->get()->map(fn (AiCall $c) => [$c->model, $c->outcome, $c->error_code])->all(),
        );
    }

    public function test_when_every_link_fails_the_gateway_is_unavailable(): void
    {
        AgentDEssai::fake(fn () => throw RateLimitedException::forProvider('anthropic'));

        $this->expectException(AiUnavailable::class);
        $this->expectExceptionMessage('ai.providers_unavailable');

        app(AiGateway::class)->run($this->requete());
    }

    public function test_a_non_failoverable_error_is_journaled_then_rethrown(): void
    {
        AgentDEssai::fake(fn () => throw new RuntimeException('panne'));

        try {
            app(AiGateway::class)->run($this->requete());
            $this->fail('l\'erreur devait remonter');
        } catch (RuntimeException $e) {
            $this->assertSame('panne', $e->getMessage());
        }
        $this->assertSame([AiCallOutcome::Error], AiCall::query()->pluck('outcome')->all());
    }

    public function test_an_exhausted_budget_refuses_without_calling_the_provider(): void
    {
        AgentDEssai::fake();
        config(['ai.budgets.daily_global_xof' => 10]);
        AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate' => 10]);

        $this->assertSame(AiRefusalReason::Budget, $this->refus($this->requete())->reason);
        AgentDEssai::assertNeverPrompted();
        $this->assertSame(1, AiCall::query()->where('refusal_reason', 'budget')->count());
    }

    public function test_the_kill_switch_refuses_without_calling_and_comes_before_the_budget(): void
    {
        AgentDEssai::fake();
        config(['ai.budgets.daily_global_xof' => 0]);
        AiUsageSetting::query()->create(['usage_key' => UsageDEssai::KEY, 'enabled' => false]);

        $this->assertSame(AiRefusalReason::KillSwitch, $this->refus($this->requete())->reason);
        AgentDEssai::assertNeverPrompted();
    }

    public function test_the_budget_comes_before_the_data_check(): void
    {
        AgentDEssai::fake();
        config(['ai.budgets.daily_global_xof' => 0]);

        $this->assertSame(AiRefusalReason::Budget, $this->refus($this->requete(classes: [AiDataClass::Sensible]))->reason);
    }

    public function test_an_actor_without_the_authority_is_refused(): void
    {
        AgentDEssai::fake();
        $requete = new AiRequest(UsageDEssai::KEY, 'x', actor: User::factory()->create());

        $this->assertSame(AiRefusalReason::Forbidden, $this->refus($requete)->reason);
        AgentDEssai::assertNeverPrompted();
    }

    public function test_two_identical_calls_reach_the_provider_once(): void
    {
        AgentDEssai::fake([['titre' => 'Villa', 'prix' => 100]]);

        app(AiGateway::class)->run($this->requete());
        $second = app(AiGateway::class)->run($this->requete());

        AgentDEssai::assertPromptedTimes(1);
        $this->assertTrue($second->fromCache);
        $this->assertSame(['titre' => 'Villa', 'prix' => 100], $second->structured);
        $this->assertSame([AiCallOutcome::Success, AiCallOutcome::CacheHit], AiCall::query()->orderBy('id')->pluck('outcome')->all());
    }

    public function test_a_public_usage_sends_no_phone_number(): void
    {
        $recu = null;
        AgentDEssai::fake(function (string $prompt) use (&$recu) {
            $recu = $prompt;

            return ['titre' => 'Villa', 'prix' => 100];
        });

        app(AiGateway::class)->run($this->requete('Villa, appelez le 77 123 45 67'));

        $this->assertStringNotContainsString('123 45 67', (string) $recu);
        $this->assertStringContainsString('[TELEPHONE]', (string) $recu);
    }

    public function test_an_evaluation_skips_budget_and_cache_and_is_flagged(): void
    {
        AgentDEssai::fake([['titre' => 'Villa', 'prix' => 100], ['titre' => 'Villa', 'prix' => 100]]);
        config(['ai.budgets.daily_global_xof' => 0]);

        app(AiGateway::class)->run($this->requete(evaluation: true));
        app(AiGateway::class)->run($this->requete(evaluation: true));

        AgentDEssai::assertPromptedTimes(2);
        $this->assertSame(2, AiCall::query()->where('is_evaluation', true)->where('outcome', 'success')->count());
    }
}
