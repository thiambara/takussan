<?php

namespace App\Services\Ai;

use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiRefusalReason;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use Illuminate\Support\Facades\Cache;
use Laravel\Ai\Exceptions\FailoverableException;
use Laravel\Ai\Responses\StructuredAgentResponse;
use Throwable;

/**
 * TCK-2383 (ADR-0076 §5) — l'UNIQUE point d'appel d'un modèle. Dans cet ordre, non négociable :
 * autorité de l'appelant, coupe-circuit, budget, données (refus, masquage), cache par empreinte,
 * appel maillon par maillon avec bascule, journal. Chaque issue, refus compris, a sa ligne de
 * `ai_calls`. Une évaluation (`AiRequest::$evaluation`) ne juge ni l'autorité ni le budget et
 * n'emprunte pas le cache : elle doit mesurer le modèle, pas une réponse gardée.
 */
final class AiGateway
{
    public function __construct(
        private readonly AiUsageRegistry $registry,
        private readonly ModelResolver $resolver,
        private readonly AiBudget $budget,
        private readonly AiDataGuard $dataGuard,
        private readonly AiAuthority $authority,
        private readonly PromptRepository $prompts,
        private readonly AiCostCalculator $costs,
    ) {}

    public function run(AiRequest $request): AiResult
    {
        $usage = $this->registry->get($request->usageKey);
        $setting = AiUsageSetting::query()->where('usage_key', $usage->key())->first();

        if (! $request->evaluation && ! $this->authority->allows($request->actor, $usage->authority(), $request->agencyId)) {
            throw $this->refuse($usage, $request, AiRefusalReason::Forbidden);
        }
        if ($setting !== null && ! $setting->enabled) {
            throw $this->refuse($usage, $request, AiRefusalReason::KillSwitch);
        }
        if (! $request->evaluation && $this->budget->exhausted($usage, $setting, $request->agencyId)) {
            throw $this->refuse($usage, $request, AiRefusalReason::Budget);
        }
        if (($reason = $this->dataGuard->refusalFor($usage, $request->dataClasses)) !== null) {
            throw $this->refuse($usage, $request, $reason);
        }
        $input = $this->dataGuard->prepare($usage, $request->input);

        $chain = $request->link !== null ? [$request->link] : $this->resolver->chainFor($usage, $setting);
        if ($chain === []) {
            throw new AiUnavailable('ai.role_unassigned');
        }

        $cacheable = $usage->cacheTtlSeconds() > 0 && $request->attachments === [] && ! $request->evaluation;
        $cacheKey = $this->cacheKey($usage, $input, $chain[0]);
        if ($cacheable && is_array($hit = Cache::get($cacheKey))) {
            $call = $this->journal($usage, $request, [
                'provider' => $hit['provider'], 'model' => $hit['model'],
                'outcome' => AiCallOutcome::CacheHit, 'cost_estimate' => 0,
            ]);

            return new AiResult($hit['text'], $hit['structured'], $call, true);
        }

        $instructions = $this->prompts->load($usage->key(), $usage->promptVersion());
        $last = null;
        foreach ($chain as $link) {
            $started = hrtime(true);
            try {
                $response = app($usage->agentClass())
                    ->configure($instructions, $link->maxTokens)
                    ->prompt($input, $request->attachments, provider: $link->provider, model: $link->model);
            } catch (FailoverableException $e) {
                $this->journal($usage, $request, $this->linkColumns($link) + [
                    'outcome' => AiCallOutcome::FailedOver, 'error_code' => class_basename($e), 'duration_ms' => $this->elapsed($started),
                ]);
                $last = $e;

                continue;
            } catch (Throwable $e) {
                $this->journal($usage, $request, $this->linkColumns($link) + [
                    'outcome' => AiCallOutcome::Error, 'error_code' => class_basename($e), 'duration_ms' => $this->elapsed($started),
                ]);

                throw $e;
            }

            $structured = $response instanceof StructuredAgentResponse ? $response->toArray() : null;
            $cost = $this->costs->estimate($link->provider, $link->model, $response->usage);
            $call = $this->journal($usage, $request, $this->linkColumns($link) + [
                'outcome' => AiCallOutcome::Success,
                'input_tokens' => $response->usage->inputTokens,
                'output_tokens' => $response->usage->outputTokens,
                'cache_read_tokens' => $response->usage->cacheReadInputTokens ?? 0,
                'cache_write_tokens' => $response->usage->cacheWriteInputTokens ?? 0,
                'cost_estimate' => $cost,
                'warning' => $cost === null ? 'model_unpriced' : null,
                'duration_ms' => $this->elapsed($started),
            ]);
            if ($cacheable) {
                Cache::put($cacheKey, [
                    'text' => $response->text, 'structured' => $structured,
                    'provider' => $link->provider, 'model' => $link->model,
                ], $usage->cacheTtlSeconds());
            }

            return new AiResult($response->text, $structured, $call, false);
        }

        throw new AiUnavailable('ai.providers_unavailable', $last);
    }

    private function refuse(AiUsage $usage, AiRequest $request, AiRefusalReason $reason): AiRefused
    {
        return new AiRefused($reason, $this->journal($usage, $request, [
            'outcome' => AiCallOutcome::Refused, 'refusal_reason' => $reason,
        ]));
    }

    /** @param  array<string, mixed>  $columns */
    private function journal(AiUsage $usage, AiRequest $request, array $columns): AiCall
    {
        return AiCall::query()->create($columns + [
            'usage_key' => $usage->key(),
            'role' => $usage->role(),
            'prompt_version' => $usage->promptVersion(),
            'is_evaluation' => $request->evaluation,
            'agency_id' => $request->agencyId,
            'actor_id' => $request->actor?->getKey(),
            'subject_type' => $request->subject?->getMorphClass(),
            'subject_id' => $request->subject?->getKey(),
        ]);
    }

    /** @return array{provider: string, model: string} */
    private function linkColumns(ModelLink $link): array
    {
        return ['provider' => $link->provider, 'model' => $link->model];
    }

    private function elapsed(int $started): int
    {
        return (int) round((hrtime(true) - $started) / 1_000_000);
    }

    private function cacheKey(AiUsage $usage, string $input, ModelLink $first): string
    {
        return 'ai:'.hash('sha256', json_encode(
            [$usage->key(), $usage->promptVersion(), $first->provider, $first->model, $input],
            JSON_THROW_ON_ERROR,
        ));
    }
}
